#!/usr/bin/env python3
"""Скачивает контуры черт и записи для всех иероглифов курса и проверяет данные.

Запуск из любого каталога: python3 tools/fetch_data.py
Уже скачанные файлы повторно не загружаются. Адреса, которых нет в источниках, запоминаются
в tools/missing.json и тоже не запрашиваются; ключ --refresh проверяет их заново.
"""
import json
import math
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
HANZI_URL = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/"
AUDIO_URL = "https://raw.githubusercontent.com/hugolpz/audio-cmn/master/64k/"
MISSING = ROOT / "tools" / "missing.json"

CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
SAY = re.compile(r'data-(?:say|hz)="([^"]+)"')
SYLLABLE = re.compile(r"^[a-zv]+[1-5]$")
SYLLABLES = re.compile(r'data-(?:syllables|sets)="([^"]+)"')
TAG = re.compile(r"<[^>]+>")
ATTR = re.compile(r'(data-(?:hz|say|py))="([^"]*)"')
PHRASE_BREAK = re.compile(r"[,.!?;:，。！？；：、]")
STAND_IN = "4123"  # легкий тон, которого нет в записях, заменяется тем же слогом с другим тоном
TONE_MARKS = {"\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4}
VOWELS = "aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ"
PINYIN_SYLLABLE = re.compile(
    f"(?:[zcs]h|[bpmfdtnlgkhjqxrzcsyw])?[{VOWELS}]+(?:ng(?![{VOWELS}])|n(?![{VOWELS}])|r(?![{VOWELS}]))?", re.I)

errors, warnings = [], []
known_missing, missing_now = set(), set()


def download(url, path):
    """Скачивает файл, если его еще нет. Возвращает False, если источник ответил 404."""
    if path.exists():
        return True
    if url in known_missing:
        missing_now.add(url)
        return False
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            body = resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            missing_now.add(url)
            return False
        raise
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return True


def numbered(syllable):
    """mù -> mu4, nǚ -> nv3, ma -> ma5 (так названы файлы в audio-cmn)."""
    out, tone = "", 5
    for c in unicodedata.normalize("NFD", syllable.lower()):
        if c in TONE_MARKS:
            tone = TONE_MARKS[c]
        elif c == "\u0308":
            out = out[:-1] + "v"
        else:
            out += c
    return f"{out}{tone}"


def point_at(med, frac):
    """Точка на осевой линии черты на заданной доле ее длины."""
    seg = [math.dist(med[i], med[i + 1]) for i in range(len(med) - 1)]
    target, acc = max(sum(seg) * frac, min(40, sum(seg))), 0
    for i, s in enumerate(seg):
        if s and acc + s >= target:
            t = (target - acc) / s
            return med[i][0] + (med[i + 1][0] - med[i][0]) * t, med[i][1] + (med[i + 1][1] - med[i][1]) * t
        acc += s
    return med[-1]


def direction_ok(name, med):
    """Грубая сверка названия черты с направлением ее осевой линии (ось y смотрит вверх)."""
    x0, y0 = med[0]
    ix, iy = point_at(med, 0.2)
    dx, dy = ix - x0, iy - y0
    ex, ey = med[-1][0] - x0, med[-1][1] - y0
    if name == "横":
        return ex > 0 and abs(ey) <= ex
    if name == "竖":
        return ey < 0 and abs(ex) <= -ey
    if name == "撇":
        return ex < 0 and ey < 0
    if name == "捺":
        return ex > 0 and ey < 0
    if name == "点":
        return ey < 0
    if name == "提":
        return ex > 0 and ey > 0
    if name in ("斜钩", "卧钩"):
        return dx > 0
    if name == "弯钩":
        return ey < 0
    if name.startswith("横"):
        return dx > 0 and abs(dy) <= dx
    if name.startswith("竖"):
        return dy < 0 and abs(dx) <= -dy
    if name.startswith("撇"):
        return dy < 0 and dx <= -dy * 0.3
    return True


def load_json(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def word_pairs(text):
    """Пары (слово, пиньинь) из тегов с data-py, порядок атрибутов любой."""
    for tag in TAG.findall(text):
        attrs = dict(ATTR.findall(tag))
        key = attrs.get("data-hz") or attrs.get("data-say")
        if key and "data-py" in attrs:
            yield key, attrs["data-py"]


def fallback_keys(py):
    """Слоги, которыми звучит слово без записи. Правило то же, что в fallbackKeys из js/ui.js:
    два третьих тона подряд внутри фразы, и первый звучит как второй."""
    keys = []
    for phrase in PHRASE_BREAK.split(py):
        tones = [numbered(s) for s in PINYIN_SYLLABLE.findall(phrase)]
        keys += [k[:-1] + "2" if k.endswith("3") and tones[i + 1:i + 2] and tones[i + 1].endswith("3") else k
                 for i, k in enumerate(tones)]
    return keys


def main():
    if "--refresh" not in sys.argv[1:] and MISSING.exists():
        known_missing.update(json.loads(MISSING.read_text(encoding="utf-8")))
    course = load_json("course.json")
    chars = load_json("chars.json")
    types = load_json("stroke-types.json")
    lessons = {l["id"]: l for m in course["modules"] for l in m["lessons"]}

    sources = list(DATA.glob("*.json")) + list(ROOT.glob("*.html")) + list((ROOT / "lessons").glob("*.html"))
    texts = {p: p.read_text(encoding="utf-8") for p in sources}
    say_keys = {k for p, t in texts.items() if p.suffix == ".html" for v in SAY.findall(t) for k in v.split()}
    say_keys |= {k for t in texts.values() for v in SYLLABLES.findall(t) for k in re.split(r"[\s/]+", v) if k}

    # Контуры черт: для каждого иероглифа, который встречается в курсе.
    download(HANZI_URL + "ARPHICPL.TXT", DATA / "hanzi" / "ARPHICPL.TXT")
    all_chars = sorted({c for t in texts.values() for c in CJK.findall(t)})
    strokes = {}
    for ch in all_chars:
        path = DATA / "hanzi" / f"{ch}.json"
        if download(HANZI_URL + urllib.parse.quote(ch) + ".json", path):
            strokes[ch] = json.loads(path.read_text(encoding="utf-8"))
        else:
            (errors if ch in chars else warnings).append(f"{ch}: нет контуров черт в hanzi-writer-data")

    # Иероглифы курса: урок, черты, слова.
    for ch, e in chars.items():
        if e["lesson"] not in lessons:
            errors.append(f"{ch}: урок {e['lesson']} отсутствует в course.json")
        for name in e["strokes"]:
            if name not in types:
                errors.append(f"{ch}: черта {name} отсутствует в stroke-types.json")
        if ch in strokes:
            medians = strokes[ch]["medians"]
            if len(e["strokes"]) != len(medians):
                errors.append(f"{ch}: названий черт {len(e['strokes'])}, а в данных {len(medians)}")
            else:
                for i, (name, med) in enumerate(zip(e["strokes"], medians)):
                    if not direction_ok(name, med):
                        warnings.append(f"{ch}: черта {i + 1} ({name}) идет не в ту сторону, проверить порядок")
        for hz, py, _ in e.get("words", []):
            if len(CJK.findall(hz)) != len(PINYIN_SYLLABLE.findall(py)):
                errors.append(f"{ch}: в слове {hz} число слогов не совпадает с числом знаков ({py})")

    # Примеры в справочнике черт должны показывать черту нужного типа.
    for name, t in types.items():
        ch, i = t["example"]
        if ch in chars and chars[ch]["strokes"][i] != name:
            errors.append(f"справочник: {ch}, черта {i + 1} в chars.json названа {chars[ch]['strokes'][i]}, а не {name}")
        if ch in strokes and not direction_ok(name, strokes[ch]["medians"][i]):
            warnings.append(f"справочник: {ch}, черта {i + 1} не похожа на {name}")

    for lid, lesson in lessons.items():
        if not (ROOT / lesson["file"]).exists():
            warnings.append(f"урок {lid}: файла {lesson['file']} пока нет")

    # Записи: слова и слоги. Чего нет в audio-cmn, озвучит синтезатор речи браузера.
    word_keys = set(chars) | {w[0] for e in chars.values() for w in e.get("words", [])}
    word_keys |= {k for k in say_keys if CJK.search(k)}
    syl_keys = {k for k in say_keys if SYLLABLE.match(k)}
    manifest = {"word": [], "syl": []}
    missing_words = []
    for key in sorted(word_keys):
        if download(AUDIO_URL + "hsk/cmn-" + urllib.parse.quote(key) + ".mp3", DATA / "audio" / "word" / f"{key}.mp3"):
            manifest["word"].append(key)
        else:
            missing_words.append(key)

    # Запасной вариант: слово без записи в браузере без китайского голоса звучит слогами носителя.
    words = [w[:2] for e in chars.values() for w in e.get("words", [])]
    words += [pair for p, t in texts.items() if p.suffix == ".html" for pair in word_pairs(t)]
    unrecorded = {ch: [numbered(e["pinyin"])] for ch, e in chars.items() if ch not in manifest["word"]}
    unrecorded |= {hz: fallback_keys(py) for hz, py in words if hz not in manifest["word"]}

    def fetch_syl(key):
        return download(AUDIO_URL + "syllabs/cmn-" + key + ".mp3", DATA / "audio" / "syl" / f"{key}.mp3")

    have = set()
    for key in sorted(syl_keys | {k for keys in unrecorded.values() for k in keys}):
        if fetch_syl(key):
            have.add(key)
        elif key in syl_keys:
            errors.append(f"слог {key} из упражнений не найден в audio-cmn")
        elif key.endswith("5"):
            stand_in = next((key[:-1] + t for t in STAND_IN if fetch_syl(key[:-1] + t)), None)
            if stand_in:
                have.add(stand_in)
    manifest["syl"] = sorted(have)
    (DATA / "audio" / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    MISSING.write_text(json.dumps(sorted(missing_now), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    def playable(key):
        return key in have or key.endswith("5") and any(key[:-1] + t in have for t in STAND_IN)

    silent = sorted(w for w, keys in unrecorded.items() if not all(map(playable, keys)))
    if silent:
        warnings.append(f"без записи и без китайского голоса не прозвучат (слогов нет в audio-cmn): {' '.join(silent)}")
    extra = sorted(f.stem for f in (DATA / "audio" / "syl").glob("*.mp3") if f.stem not in have)
    if extra:
        warnings.append(f"записи слогов, которые курсу не нужны: {' '.join(extra)}")

    print(f"Иероглифов в курсе: {len(chars)}, всего знаков с контурами: {len(strokes)}")
    print(f"Записей слов: {len(manifest['word'])}, слогов: {len(manifest['syl'])}")
    if missing_words:
        print(f"Без записи (озвучит браузер): {' '.join(missing_words)}")
    for w in warnings:
        print(f"ВНИМАНИЕ: {w}")
    for e in errors:
        print(f"ОШИБКА: {e}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
