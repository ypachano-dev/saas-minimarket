import subprocess

keywords = ["rapidez", "rapides", "temperatura", "velocidad", "prompt", "sistema", "configur", "agente"]
result = subprocess.run(["git", "log", "-p"], capture_output=True, check=True)

# Decode using utf-8 with fallback to replace to avoid encoding errors on Windows
stdout_text = result.stdout.decode("utf-8", errors="replace")
commits = stdout_text.split("commit ")
print("Searching commits in git history...")
for commit in commits:
    if not commit:
        continue
    lines = commit.split("\n")
    header = lines[0]
    # Check if any keyword matches in added/removed lines
    found_keywords = []
    for line in lines:
        if line.startswith("+") or line.startswith("-"):
            for kw in keywords:
                if kw in line.lower():
                    found_keywords.append(kw)
    if found_keywords:
        print(f"Commit: {header[:12]} contains keywords: {set(found_keywords)}")
        # Print first few lines of the commit description
        for l in lines[1:8]:
            print("  ", l)
        print("-" * 50)
