#!/usr/bin/env bash
#
# Replace the text of one Markdown section in the body of a pull request, and
# keep every other part of the body.
#
# `gh pr edit --body` replaces the complete body, so an agent that writes the
# body again by hand drops parts of it. Two merged pull requests lost their
# `Closes #<issue>` line this way, and the merge closed no issue.
#
# Usage: scripts/replace_pr_section.sh [--add-if-missing] <pr-number> <heading> <report-file>
#
#   <heading>      the full heading line, for example "## Visual Verification"
#   <report-file>  a file with the new text of the section, without the heading
#   --add-if-missing  add the section at the end of the body when the body
#                     holds no such heading, instead of a failure
#
# A section runs from its heading line to the next heading of the same level or
# of a higher level, or to the end of the body.
#
# The attribution footer that starts with "🤖 Generated with" is not part of
# any section. The script holds it back, and puts it at the end again. Without
# this, a swap of the last section of the body would eat the footer.
#
# The script fails, and writes nothing, if:
#   - the body holds no such heading, and --add-if-missing is not given;
#   - the new body drops a `Closes #<number>` line that the old body holds.
#
# To test the script with no call to the GitHub API, set PR_BODY_FILE to a file
# with the body. The script then writes the new body to stdout.
#
# Needs: gh (authenticated), awk.

set -euo pipefail

add_if_missing=0
if [ "${1:-}" = "--add-if-missing" ]; then
  add_if_missing=1
  shift
fi

PR="${1:?usage: replace_pr_section.sh [--add-if-missing] <pr-number> <heading> <report-file>}"
HEADING="${2:?usage: replace_pr_section.sh <pr-number> <heading> <report-file>}"
REPORT="${3:?usage: replace_pr_section.sh <pr-number> <heading> <report-file>}"

if [ ! -f "$REPORT" ]; then
  echo "replace_pr_section.sh: no such report file: $REPORT" >&2
  exit 2
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

old="$workdir/old.md"
new="$workdir/new.md"
footer="$workdir/footer.md"

if [ -n "${PR_BODY_FILE:-}" ]; then
  cat "$PR_BODY_FILE" > "$old"
else
  gh pr view "$PR" --json body --jq .body > "$old"
fi

# Hold the attribution footer back, so a swap of the last section keeps it.
footer_line="$(grep -n -m1 -F -- '🤖 Generated with' "$old" | cut -d: -f1 || true)"
: > "$footer"
if [ -n "$footer_line" ]; then
  tail -n "+$footer_line" "$old" > "$footer"
  head -n "$((footer_line - 1))" "$old" > "$old.main"
  mv "$old.main" "$old"
fi

if ! grep -qxF -- "$HEADING" "$old"; then
  if [ "$add_if_missing" -eq 0 ]; then
    echo "replace_pr_section.sh: the body of pull request $PR holds no line '$HEADING'" >&2
    exit 1
  fi
  # Add the section at the end, and keep every part of the body before it.
  printf '%s\n' "" "$HEADING" "" >> "$old"
  cat "$REPORT" >> "$old"
fi

# Copy the body, and swap the text of the named section for the report.
awk -v heading="$HEADING" -v report="$REPORT" '
  # The level of a heading is the count of leading "#" characters.
  function level(line,   n) {
    n = 0
    while (substr(line, n + 1, 1) == "#") n++
    if (substr(line, n + 1, 1) != " ") return 0
    return n
  }
  BEGIN { want = level(heading) }
  $0 == heading {
    print
    print ""
    while ((getline line < report) > 0) print line
    close(report)
    print ""
    inside = 1
    next
  }
  inside {
    # A heading of the same level or of a higher level ends the section.
    if (level($0) > 0 && level($0) <= want) inside = 0
    else next
  }
  { print }
' "$old" > "$new"

# The swap writes one blank line on each side of the report. Squeeze the pair
# that a report with its own blank line at the start or the end makes.
if [ -s "$footer" ]; then
  printf '\n' >> "$new"
  cat "$footer" >> "$new"
fi

cat -s "$new" > "$new.tidy"
mv "$new.tidy" "$new"

# The body must keep every "Closes #<number>" line. This is the failure that
# the section swap is here to stop, so check it as well.
missing=""
while read -r ref; do
  if ! grep -qiF -- "$ref" "$new"; then
    missing="$missing $ref"
  fi
done < <(grep -oiE '(closes|fixes|resolves) #[0-9]+' "$old" | sort -u)

if [ -n "$missing" ]; then
  echo "replace_pr_section.sh: the new body drops:$missing" >&2
  exit 1
fi

if [ -n "${PR_BODY_FILE:-}" ]; then
  cat "$new"
else
  gh pr edit "$PR" --body-file "$new"
fi
