import urllib.request
import json

with open("contracts/splitter/src/test.rs", "r") as f:
    code = f.read()

req = urllib.request.Request("https://play.rust-lang.org/format", 
    data=json.dumps({"code": code, "edition": "2021"}).encode("utf-8"),
    headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode())
        if result.get("success"):
            with open("contracts/splitter/src/test.rs", "w") as f:
                f.write(result["code"])
            print("Formatted successfully")
        else:
            print("Formatting failed:", result)
except Exception as e:
    print("Error:", e)
