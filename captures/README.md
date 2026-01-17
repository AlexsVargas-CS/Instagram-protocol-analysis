# Captures Directory

This directory is for storing mitmproxy capture files.

## Files to store here:
- `instagram_capture.flow` - Raw mitmproxy captures
- Exported JSON files in `exported/` subdirectory

## ⚠️ Security Note
**DO NOT commit capture files to git!**

Capture files may contain:
- Session tokens
- Authentication cookies
- Personal messages
- Device identifiers

These files are listed in `.gitignore` for your protection.

## How to export captures

```bash
# Export your flow file to readable JSON
python scripts/export-flow.py captures/instagram_capture.flow captures/exported/
```
