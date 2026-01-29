import json
import sys
from vigil_cryptographicsign import sign_action

payload = json.loads(sys.argv[1])
proof = sign_action(payload)

print(json.dumps(proof))
