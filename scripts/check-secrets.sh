#!/usr/bin/env bash
# Pre-commit secret scanner — aborts the commit if a likely secret is staged.
# Install: ln -s ../../scripts/check-secrets.sh .git/hooks/pre-commit
# Or call from any pre-commit framework.

set -euo pipefail

# Patterns that indicate a leaked secret
PATTERNS=(
  'kh_[A-Za-z0-9_]{20,}'                 # KeeperHub API keys
  '0x[a-fA-F0-9]{64}'                    # 64-hex private keys (with 0x)
  '[a-fA-F0-9]{64}'                      # 64-hex private keys (no 0x) — high false-positive rate, see below
  'sk_live_[A-Za-z0-9]+'                 # Stripe live keys
  'AKIA[0-9A-Z]{16}'                     # AWS access key ID
  'ghp_[A-Za-z0-9]{36,}'                 # GitHub personal access token
  'ghs_[A-Za-z0-9]{36,}'                 # GitHub server token
  'xoxb-[A-Za-z0-9-]+'                   # Slack bot token
)

# Files we never scan (test fixtures, contracts with bytecode, vendored libs, etc.)
SKIP_PATHS=(
  'out/'              # Foundry build artifacts (have bytecode that matches 64-hex)
  'cache/'
  'node_modules/'
  '.git/'
  'dist/'
  'build/'
  'broadcast/'
  'contracts/lib/'    # Vendored Solidity libs (forge-std test fixtures contain hex literals)
  '/lib/'             # Any nested submodule lib dirs
  '/abis/'            # Public contract ABIs — event topic hashes look like 64-hex
  '\.lock$'
  'bun\.lock'
  'package-lock\.json'
)

STAGED=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED" ]; then
  exit 0
fi

EXIT_CODE=0
for FILE in $STAGED; do
  # Skip binary + skipped paths
  for SKIP in "${SKIP_PATHS[@]}"; do
    if [[ "$FILE" =~ $SKIP ]]; then
      continue 2
    fi
  done

  # .env.example may contain public defaults (URLs, chain IDs) but never secrets.
  # Any line that looks like a secret pattern is rejected.
  if [[ "$FILE" == ".env.example" ]] || [[ "$FILE" == *"/.env.example" ]]; then
    SECRET_PATTERNS_IN_EXAMPLE=(
      'kh_[A-Za-z0-9_]{20,}'
      '0x[a-fA-F0-9]{64}'
      '^[^#=]*=[a-fA-F0-9]{64}$'              # bare 64-hex private key
      'sk_live_[A-Za-z0-9]+'
      'AKIA[0-9A-Z]{16}'
      'ghp_[A-Za-z0-9]{36,}'
      'ghs_[A-Za-z0-9]{36,}'
      'xoxb-[A-Za-z0-9-]+'
    )
    for P in "${SECRET_PATTERNS_IN_EXAMPLE[@]}"; do
      if grep -Eq "$P" "$FILE" 2>/dev/null; then
        echo "✗ $FILE contains a secret-shaped value (pattern: $P) — only safe defaults allowed" >&2
        grep -nE "$P" "$FILE" | head -3 >&2
        EXIT_CODE=1
      fi
    done
    continue
  fi

  # Block .env from ever being staged
  if [[ "$FILE" == ".env" ]] || [[ "$FILE" == *"/.env" ]] || [[ "$FILE" == *".env."* && "$FILE" != *".env.example" ]]; then
    echo "✗ $FILE is being staged — .env must never be committed (.gitignore should block this)" >&2
    EXIT_CODE=1
    continue
  fi

  # Scan for secret patterns
  for PATTERN in "${PATTERNS[@]}"; do
    if grep -Eq "$PATTERN" "$FILE" 2>/dev/null; then
      # The 64-hex pattern false-positives heavily on contract bytecode + test mnemonics
      # Allow if the file is a Solidity test or known fixture
      if [[ "$PATTERN" == '[a-fA-F0-9]{64}' ]] && [[ "$FILE" =~ \.(t\.sol|sol|test\.ts)$ ]]; then
        continue
      fi
      echo "✗ $FILE matches pattern '$PATTERN' — possible secret leak" >&2
      grep -nE "$PATTERN" "$FILE" | head -3 >&2
      EXIT_CODE=1
    fi
  done
done

if [ $EXIT_CODE -ne 0 ]; then
  echo "" >&2
  echo "Commit aborted. Remove the secret(s) and try again." >&2
  echo "If this is a false positive, edit scripts/check-secrets.sh SKIP_PATHS." >&2
fi

exit $EXIT_CODE
