#!/usr/bin/env python3
"""
HTTP Bridge Server for vigil-mcp

This is a thin HTTP adapter that exposes the vigil-mcp MCP server via HTTP endpoints.
It does NOT modify the MCP protocol implementation - it spawns vigil-mcp as a subprocess
and communicates via stdin/stdout.

Security Features:
- API key authentication
- Rate limiting per key
- Input validation
- No privilege escalation
- Signing keys remain server-side

Deployment:
- Compatible with Fly.io
- Health check endpoint
- OpenAPI spec for GPT Actions
"""

import asyncio
import json
import os
import subprocess
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Security, status, Request
from fastapi.security import APIKeyHeader
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Initialize FastAPI app
app = FastAPI(
    title="Vigil MCP Bridge",
    description="HTTP bridge for vigil-mcp security scanning and cryptographic signing",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security: API Key authentication
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)
CONFIGURED_API_KEYS = set(k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip()) if os.getenv("API_KEYS") else set()

# Configuration
MCP_SERVER_PATH = os.getenv("MCP_SERVER_PATH", "/app/build/index.js")
MAX_SCAN_TIMEOUT = int(os.getenv("MAX_SCAN_TIMEOUT", "300"))  # 5 minutes default

# Request/Response Models
class ScanRequest(BaseModel):
    """Request model for scanning operations"""
    target: str = Field(..., description="Target to scan: 'host' or 'repo'")
    repo_url: Optional[str] = Field(None, description="Repository URL (required when target is 'repo')")
    dry_run: bool = Field(True, description="Run in dry-run mode without making changes")

    @validator('target')
    def validate_target(cls, v):
        if v not in ['host', 'repo']:
            raise ValueError("target must be either 'host' or 'repo'")
        return v

    @validator('repo_url')
    def validate_repo_url(cls, v, values):
        if values.get('target') == 'repo' and not v:
            raise ValueError("repo_url is required when target is 'repo'")
        return v


class VerifyRequest(BaseModel):
    """Request model for signature verification"""
    payload: Dict[str, Any] = Field(..., description="The payload to verify")
    signature: str = Field(..., description="The signature to verify")
    purpose: str = Field(..., description="Purpose of the signature")


class FindingsModel(BaseModel):
    """Structured findings from scan"""
    open_ports: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    file_findings: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    system_issues: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class SummaryModel(BaseModel):
    """Summary of scan findings"""
    risk_level: str = Field(..., description="Risk level: low, medium, high, critical")
    total_findings: int = Field(..., description="Total number of findings")


class ScanResult(BaseModel):
    """Response model for scan operations (matches MCP output)"""
    timestamp: str = Field(..., description="ISO 8601 timestamp of scan")
    target: str = Field(..., description="Target that was scanned")
    findings: FindingsModel = Field(..., description="Structured findings")
    summary: SummaryModel = Field(..., description="Summary of findings")
    raw_output: str = Field(..., description="Raw output from vigil-scan")
    signature: Optional[str] = Field(None, description="Cryptographic signature (for signed scans)")
    signature_metadata: Optional[Dict[str, str]] = Field(None, description="Signature metadata")


class SignedScanResponse(BaseModel):
    """Response model for signed scan operations"""
    scan_result: ScanResult = Field(..., description="The scan results")
    cryptographic_proof: Dict[str, Any] = Field(..., description="Cryptographic proof of authenticity")
    is_tamper_evident: bool = Field(True, description="Whether this is tamper-evident")


class ErrorResponse(BaseModel):
    """Error response model"""
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    mcp_server_available: bool = Field(..., description="Whether MCP server is available")
    dependencies: Dict[str, bool] = Field(..., description="Dependency status")


# Security: API Key validation
async def validate_api_key(api_key: str = Security(API_KEY_HEADER)) -> str:
    """Validate API key from header"""
    if not CONFIGURED_API_KEYS:
        # If no API keys configured, allow all requests (for development only)
        import logging
        logging.warning("⚠️  Running in DEV MODE without API keys - DO NOT use in production!")
        return "dev-mode"
    
    if api_key not in CONFIGURED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )
    return api_key


# MCP Communication Layer
class MCPClient:
    """
    Client for communicating with vigil-mcp subprocess via stdin/stdout.
    This is a thin adapter that does NOT modify the MCP protocol.
    """
    
    @staticmethod
    async def call_tool(tool_name: str, arguments: Dict[str, Any], timeout: int = MAX_SCAN_TIMEOUT) -> Dict[str, Any]:
        """
        Call an MCP tool by spawning vigil-mcp subprocess and communicating via stdio.
        
        Args:
            tool_name: Name of the tool to call (e.g., "vigil.scan")
            arguments: Tool arguments
            timeout: Maximum time to wait for response
            
        Returns:
            Tool response as dict
            
        Raises:
            HTTPException on errors
        """
        # Construct MCP request (JSON-RPC format)
        mcp_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        try:
            # Spawn vigil-mcp subprocess
            process = await asyncio.create_subprocess_exec(
                "node",
                MCP_SERVER_PATH,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            # Send request to stdin
            request_json = json.dumps(mcp_request) + "\n"
            
            # Wait for response with timeout
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(input=request_json.encode()),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=f"Tool execution timed out after {timeout} seconds"
                )
            except Exception:
                # Ensure process cleanup on any error
                if process.returncode is None:
                    process.kill()
                    await process.wait()
                raise
            
            # Check process exit code
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"MCP server error: {error_msg}"
                )
            
            # Parse response
            response_text = stdout.decode().strip()
            if not response_text:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Empty response from MCP server"
                )
            
            # Handle multiple JSON objects (MCP may send initialization messages)
            lines = response_text.split('\n')
            response = None
            for line in lines:
                if line.strip():
                    try:
                        obj = json.loads(line)
                        # Look for the actual tool response
                        if obj.get("id") == 1 and "result" in obj:
                            response = obj
                            break
                    except json.JSONDecodeError:
                        continue
            
            if not response:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not parse MCP response"
                )
            
            # Extract result
            result = response.get("result", {})
            
            # Check for errors in result
            if result.get("isError"):
                content = result.get("content", [])
                error_text = content[0].get("text", "Unknown error") if content else "Unknown error"
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Tool execution error: {error_text}"
                )
            
            # Extract content
            content = result.get("content", [])
            if not content:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="No content in tool response"
                )
            
            # Parse the text content as JSON
            text_content = content[0].get("text", "{}")
            return json.loads(text_content)
            
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to parse response: {str(e)}"
            )
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MCP server not found. Please ensure vigil-mcp is installed."
            )
        except Exception as e:
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unexpected error: {str(e)}"
            )


# API Endpoints

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint for Fly.io and monitoring systems.
    
    Returns service status and dependency availability.
    """
    # Check if MCP server is available
    mcp_available = os.path.exists(MCP_SERVER_PATH)
    
    # Check dependencies (vigil-scan, python3)
    dependencies = {}
    
    try:
        subprocess.run(["vigil-scan", "--version"], capture_output=True, timeout=5)
        dependencies["vigil-scan"] = True
    except (subprocess.SubprocessError, FileNotFoundError):
        dependencies["vigil-scan"] = False
    
    try:
        subprocess.run(["python3", "--version"], capture_output=True, timeout=5)
        dependencies["python3"] = True
    except (subprocess.SubprocessError, FileNotFoundError):
        dependencies["python3"] = False
    
    try:
        subprocess.run(
            ["python3", "-c", "import vigil_cryptographicsign"],
            capture_output=True,
            timeout=5
        )
        dependencies["vigil-cryptographicsign"] = True
    except (subprocess.SubprocessError, FileNotFoundError):
        dependencies["vigil-cryptographicsign"] = False
    
    return HealthResponse(
        status="healthy" if mcp_available else "degraded",
        mcp_server_available=mcp_available,
        dependencies=dependencies
    )


@app.post(
    "/scan",
    response_model=ScanResult,
    tags=["Scanning"],
    summary="Run security scan",
    description="Run a Vigil security scan on the specified target and return structured results."
)
@limiter.limit("10/minute")
async def scan(
    request: Request,
    scan_request: ScanRequest,
    api_key: str = Security(validate_api_key)
):
    """
    Run a security scan on host or repository.
    
    This endpoint invokes the vigil.scan MCP tool via subprocess communication.
    The scan is performed by the external vigil-scan tool.
    
    **Rate Limit:** 10 requests per minute per IP
    
    **Authentication:** Requires valid API key in X-API-Key header
    
    **Dangerous Operation:** This tool can scan systems and may reveal sensitive information.
    """
    result = await MCPClient.call_tool("vigil.scan", scan_request.dict())
    return ScanResult(**result)


@app.post(
    "/scan/signed",
    response_model=SignedScanResponse,
    tags=["Scanning"],
    summary="Run security scan with cryptographic signature",
    description="Run a Vigil security scan and return cryptographically signed, tamper-evident results."
)
@limiter.limit("5/minute")
async def scan_signed(
    request: Request,
    scan_request: ScanRequest,
    api_key: str = Security(validate_api_key)
):
    """
    Run a security scan with cryptographic signature for tamper-evidence.
    
    This endpoint invokes the vigil.scan.signed MCP tool which:
    1. Runs the scan using vigil-scan
    2. Signs the results using vigil-cryptographicsign
    3. Returns both scan results and cryptographic proof
    
    The signature ensures that scan results cannot be tampered with after generation.
    
    **Rate Limit:** 5 requests per minute per IP (more restrictive due to signing overhead)
    
    **Authentication:** Requires valid API key in X-API-Key header
    
    **Dangerous Operation:** This tool can scan systems and create cryptographic signatures.
    Use with caution.
    """
    result = await MCPClient.call_tool("vigil.scan.signed", scan_request.dict())
    return SignedScanResponse(**result)


# NOTE: Verification endpoint is commented out until proper verification is implemented
# The current MCP implementation only has a signing tool, not a verification tool.
# Uncomment and update once vigil.proof.verify is available in the MCP server.
#
# @app.post(
#     "/verify",
#     response_model=Dict[str, Any],
#     tags=["Verification"],
#     summary="Verify cryptographic signature",
#     description="Verify a cryptographic signature for a payload."
# )
# @limiter.limit("30/minute")
# async def verify(
#     request: Request,
#     verify_request: VerifyRequest,
#     api_key: str = Security(validate_api_key)
# ):
#     """
#     Verify a cryptographic signature.
#     """
#     result = await MCPClient.call_tool(
#         "vigil.proof.verify",  # This tool doesn't exist yet
#         {
#             "payload": verify_request.payload,
#             "signature": verify_request.signature,
#             "purpose": verify_request.purpose
#         }
#     )
#     return result


@app.get("/", tags=["Info"])
async def root():
    """
    Root endpoint with API information.
    """
    return {
        "name": "Vigil MCP Bridge",
        "version": "0.1.0",
        "description": "HTTP bridge for vigil-mcp security scanning and cryptographic signing",
        "endpoints": {
            "health": "/health",
            "scan": "/scan",
            "scan_signed": "/scan/signed",
            "docs": "/docs",
            "openapi": "/openapi.json"
        },
        "documentation": "https://github.com/vigil-xy/vigil-mcp"
    }


# Exception handlers

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom exception handler for HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.detail,
            detail=None  # Don't duplicate detail in both fields
        ).dict()
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Custom exception handler for all other exceptions"""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="Internal server error",
            detail=str(exc)
        ).dict()
    )


# Main entry point
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8080"))
    host = os.getenv("HOST", "0.0.0.0")
    
    print(f"Starting Vigil MCP Bridge on {host}:{port}")
    print(f"MCP Server Path: {MCP_SERVER_PATH}")
    print(f"API Keys: {'Configured' if VALID_API_KEYS else 'NOT CONFIGURED (dev mode)'}")
    
    uvicorn.run(app, host=host, port=port)
