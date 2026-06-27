import subprocess

result = subprocess.run(["git", "log", "--pretty=format:", "--name-only"], capture_output=True, text=True, check=True)
files = set(filter(None, result.stdout.split("\n")))
print("All files in git history:")
for f in sorted(files):
    if "agent" in f.lower() or "config" in f.lower() or "bot" in f.lower() or "alo" in f.lower() or "vale" in f.lower() or "yhorge" in f.lower():
        print(f)
