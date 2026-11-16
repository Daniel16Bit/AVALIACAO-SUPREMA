"""Proves that a formatting change did not alter any style sheet.

For every tracked .css file whose working copy differs from a Git reference, both versions
are parsed by a real browser and the resulting rules are compared one by one, as the browser
serializes them. Spacing, letter case of colours and the spelling of numbers do not count;
selectors, properties, values, their order and the media queries do.

Requires Python Playwright and Chromium, as tests/browser/smoke.py.
Run from the project root: python tests/browser/css_equivalence.py [ref]
"""
from pathlib import Path
import subprocess
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
REF = sys.argv[1] if len(sys.argv) > 1 else "HEAD"

RULES = r"""css => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const walk = rules => [...rules].flatMap(rule => rule.cssRules && rule.cssRules.length && !(rule instanceof CSSStyleRule)
    ? [rule.constructor.name + ' ' + (rule.conditionText || rule.name || ''), ...walk(rule.cssRules), 'end']
    : [rule.cssText]);
  // A value that uses var() is kept by the browser as it was typed, so the space the formatter
  // puts after a comma would count as a difference. Outside quoted text that space means nothing.
  const commas = text => text.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((part, i) => i % 2 ? part : part.replace(/,\s+/g, ',')).join('');
  return walk(sheet.cssRules).map(commas);
}"""


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True).stdout.decode("utf-8")


def run():
    changed = [name for name in git("diff", "--name-only", REF, "--", "*.css").splitlines() if name]
    different = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        for name in changed:
            path = ROOT / name
            if not path.exists():
                continue
            before = page.evaluate(RULES, git("show", f"{REF}:{name}"))
            after = page.evaluate(RULES, path.read_text(encoding="utf-8"))
            if before == after:
                print(f"IDENTICO  {name} ({len(after)} regras)")
            else:
                different += 1
                index = next((i for i, (a, b) in enumerate(zip(before, after)) if a != b), min(len(before), len(after)))
                print(f"DIFERENTE {name}: regra {index + 1} de {len(before)} -> {len(after)}")
                print("   antes : " + (before[index] if index < len(before) else "(nada)")[:200])
                print("   depois: " + (after[index] if index < len(after) else "(nada)")[:200])
        browser.close()
    print(f"{len(changed)} folha(s) de estilo alterada(s) em relacao a {REF}; {different} com diferenca.")
    sys.exit(1 if different else 0)


if __name__ == "__main__":
    run()
