#!/usr/bin/env python3
"""Builds the site with the real address and copies it to docs/ (for GitHub Pages "Deploy from a branch" -> /docs).
Usage: SITE_URL=https://<user>.github.io/<repo> [CONTACT_EMAIL=...] python3 tools/publish_docs.py"""
import os, shutil, subprocess, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
if not os.environ.get("SITE_URL"):
    sys.exit("Set SITE_URL first, e.g. SITE_URL=https://user.github.io/repo")
subprocess.check_call([sys.executable, os.path.join(root, "tools", "build.py")])
dst = os.path.join(root, "docs")
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(os.path.join(root, "site"), dst)
open(os.path.join(dst, ".nojekyll"), "w").close()
print("docs/ ready")
