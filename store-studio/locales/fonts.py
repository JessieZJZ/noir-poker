"""Add only the extra marketing glyphs; never change the App's bundled fonts."""
import json,hashlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
root=Path(__file__).resolve().parents[2]
studio=root/'store-studio'
catalog=json.loads((studio/'locales/catalog.json').read_text())
coverage=set(json.loads((root/'public/fonts/coverage.json').read_text())['codepoints'])
needed=set()
for c in catalog.values():
 text=''.join(c['head']+c['lead']+c['say']+[t for row in c['cards'] for t in row]+[c['feature'],c['tag'],c['ribbon'],c['footer']])
 needed.update(map(ord,text.replace('\n','')))
remaining=needed-coverage
result=[]
for family in ['sc','kr']:
 source=root/f'.artifacts/store-media-v6/font-sources/noto-{family}.ttf'
 font=TTFont(source)
 take=remaining&set(font.getBestCmap())
 options=subset.Options();options.flavor='woff2'
 sub=subset.Subsetter(options=options);sub.populate(unicodes=take or {32});sub.subset(font)
 font.flavor='woff2'
 output=studio/f'public/assets/store-extra-{family}.woff2';font.save(output)
 supplements=studio/'font-supplements';supplements.mkdir(exist_ok=True)
 (supplements/output.name).write_bytes(output.read_bytes())
 remaining-=take;coverage.update(take)
 result.append({'family':family,'source':'https://github.com/google/fonts/tree/main/ofl/notosans'+family,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'addedCharacters':''.join(map(chr,sorted(take)))})
if remaining:raise RuntimeError('Missing glyphs: '+''.join(map(chr,remaining)))
(root/'.artifacts/store-media-v6/qa/font-coverage.json').write_text(json.dumps({'allRenderedMarketingCharactersCovered':True,'sources':result},ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False))
