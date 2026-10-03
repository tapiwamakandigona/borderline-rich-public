#!/usr/bin/env python3
"""Read an Android `uiautomator dump` (the WebView exposes the game's DOM through accessibility).

  android_ui.py ui.xml find REGEX   -> prints "x y": centre of the first on-screen node whose
                                       text or content-desc matches REGEX; exit 1 if none
  android_ui.py ui.xml money        -> prints the largest plain money label ("$17.8", "$1.2K")
                                       on screen as a number, exit 1 if none
Used by scripts/android-smoke.sh in the CI device-smoke job.
"""
import re
import sys
import xml.etree.ElementTree as ET

UNITS = {'': 1, 'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12}


def nodes(path):
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, FileNotFoundError):
        return []
    return list(root.iter('node'))


def centre(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '[0,0][0,0]')))
    return (x1 + x2) // 2, (y1 + y2) // 2


def main():
    path, mode = sys.argv[1], sys.argv[2]
    if mode == 'find':
        rx = re.compile(sys.argv[3])
        all_nodes = nodes(path)
        if not all_nodes:
            return 1
        sw, sh = (c * 2 for c in centre(all_nodes[0]))  # first node spans the whole screen
        for n in all_nodes:
            x, y = centre(n)
            on_screen = 0 < x < sw and 0 < y < sh
            if on_screen and any(rx.search((n.get(k) or '').strip()) for k in ('text', 'content-desc')):
                print(x, y)
                return 0
        return 1
    if mode == 'money':
        best = None
        for n in nodes(path):
            m = re.fullmatch(r'\$([\d,]+(?:\.\d+)?)([KMBT]?)', (n.get('text') or '').strip())
            if m:
                v = float(m.group(1).replace(',', '')) * UNITS[m.group(2)]
                best = v if best is None else max(best, v)
        if best is None:
            return 1
        print(best)
        return 0
    return 2


if __name__ == '__main__':
    sys.exit(main())
