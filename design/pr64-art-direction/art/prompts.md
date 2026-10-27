# 原创绿色牌室背景：生成提示与来源

生成方式：内置 `image_gen.imagegen`，每个资产单独生成；没有调用API/CLI，没有复制商业截图或其品牌元素。用途为可合成的房间背景，不是完整UI。

三张均为1536×1024，3:2横幅，无人物、无卡牌、无文字、无UI。下方约60%留暗部，手机按中轴裁切。原始PNG与WebP交付位于同目录；WebP仅做格式压缩，没有更改构图或颜色。

## jade

文件：room-jade-v2.png / room-jade-v2.webp

生成原件：/Users/zjz/.codex/generated_images/01a17796-f882-79f3-acdc-52562f37d87c/exec-6281b80d-0488-4b65-854f-c8999d56961d.png

提示词：

```text
Use case: stylized-concept. Asset type: original high-end 3D poker game room BACKGROUND PLATE for a Chinese practice game, not a UI mockup. Create a cinematic photorealistic 3D environment render, landscape 3:2 composition, 1536x1024 or higher. Scene: an elegant emerald royal private poker room, forest-green velvet wall panels, dark walnut architectural details, discreet aged brass seams, a few warm practical pendant lamps. Natural physically based materials, deep soft shadows, volumetric light only very restrained, convincing real depth and premium commercial-game art polish. Camera is centered, frontal from a seated player's viewpoint slightly elevated, looking into the room. CRITICAL COMPOSITION: all recognizable room furniture, distant empty tables and lamps occupy ONLY the TOP 40 PERCENT of the image; the entire LOWER 60 PERCENT is very dark green-black, low-detail, unobstructed negative space for a separate poker table and UI that will be composited later. A soft gradual transition, no horizontal cut. Upper background can show a distant empty gaming lounge with furniture gently out of focus. Keep upper-center architecture beautiful and recognizable when cropped vertically to the central third for mobile; side edges expendable. Green is the overwhelmingly dominant hue, warm brass only small accents. No people at all. NO foreground poker table, no felt tabletop in foreground, no cards, no chips, no logos, no lettering, no numbers, no UI, no buttons, no watermarks, no candles, no Halloween objects, no pumpkins. This is an original room environment, not a copy of any existing casino or commercial game.
```

## salon

文件：room-salon-v2.png / room-salon-v2.webp

生成原件：/Users/zjz/.codex/generated_images/01a17796-f882-79f3-acdc-52562f37d87c/exec-1e6f8397-c1b3-4aab-9a12-07a3f7c3e360.png

提示词：

```text
Use case: stylized-concept. Asset type: original high-end 3D poker game room BACKGROUND PLATE, not a complete UI. Landscape 3:2, target 1536x1024 or higher. Create a premium cinematic photorealistic 3D render of a quiet ebony-and-emerald private card club at night. Deep forest-green suede alcoves, near-black ebony wall cladding, restrained green leather banquettes, subtle warm gold pinstriping, softly glowing warm shaded pendant fixtures. Rich physically based leather, wood and metal with realistic contact shadows and depth of field; sophisticated film lighting, dark and luxurious rather than a flat web dashboard. Centered symmetrical composition, frontal slightly elevated seated eye level. CRITICAL: recognizable room architecture, lamps, banquettes and a few distant EMPTY tables stay ONLY in the UPPER 40 PERCENT; lower 60 percent is very dark green-black low-detail empty negative space reserved for a separate composited game table and action UI. Smooth natural darkness transition; do not render a close table. The upper center must retain room identity in a portrait crop of the central third; side detail may crop away. Overall palette is GREEN and green-black, tiny restrained champagne-gold highlights only, no purple or blue room lighting. No people. No foreground table, cards, chips, text, numbers, logo, UI, borders, labels, watermarks, pumpkins, Halloween decoration or fantasy costume. Entirely original architectural and environment design.
```

## polar

文件：room-polar-v2.png / room-polar-v2.webp

生成原件：/Users/zjz/.codex/generated_images/01a17796-f882-79f3-acdc-52562f37d87c/exec-cb880b03-1ebc-4189-80d8-77752fddf09f.png

提示词：

```text
Use case: stylized-concept. Asset type: original high-end 3D poker game arena BACKGROUND PLATE, not a UI screenshot. Landscape 3:2, target 1536x1024 or higher. Render a modern premium live poker tournament venue in realistic polished 3D game-environment art. Dominant emerald and forest green, charcoal structural beams, small jade-white practical lights. Real overhead event lighting trusses, acoustic green upholstered wall panels, subtle distant EMPTY poker tables softened by depth of field. Premium realistic leather and brushed dark metal, cinematic physical lighting, natural depth and contact shadows. Not sci-fi, no holograms, no technology HUD or flat graphic interface. Central symmetrical composition from slightly elevated seated eye level. CRITICAL: event truss, recognizable architecture and all distant furniture occupy the UPPER 40 PERCENT ONLY; the entire LOWER 60 PERCENT is near-black green, very dark low-detail empty negative space so an independent game table and UI can later be placed there. Smooth darkness transition, no foreground table. Upper-center lights and green architecture should still read clearly in a portrait crop of the central third; sides can crop. Green is overwhelmingly dominant, no blue lighting scheme, no neon wash. No people, no cards, no chips, no logos, no text or digits, no labels, no buttons, no UI, no watermarks, no festive objects. Entirely original arena design, grounded and elegant.
```

## felt-emerald-v2：真实毛毡

文件：`felt-emerald-v2.png` / `felt-emerald-v2.webp`。使用内置 imagegen；原件1254×1254，运行时WebP768×768，仅作尺寸/编码压缩。原件：`/Users/zjz/.codex/generated_images/01a17795-8d0f-7ab1-b17c-c475e8a57580/exec-f7d9e494-b4d8-415b-8f1c-5fa9e4cacb20.png`。

```text
Use case: stylized-concept. Asset type: original PBR-style game material texture for NOIR Poker. Create one square 2048-style seamless repeatable flat top-down material swatch of premium deep emerald green poker speed-cloth wool felt, evenly lit, extremely fine short fibers with subtle woven diagonal structure, realistic soft tactile surface, small natural variation but no stains and no objects. This will tile over an elliptical table in a high-end 3D poker game UI. Palette: rich deep forest emerald #10553b and #174b37 with restrained tiny jade flecks. Entire image is the SAME material, edge-to-edge, no perspective, no table, no room, no borders, no text, no icons, no cards, no hands, no shadows or dramatic gradient, no watermark. Real material fidelity, never a flat CSS gradient or noisy coarse fabric.
```

## leather-rail-v2：皮革桌沿

文件：`leather-rail-v2.png` / `leather-rail-v2.webp`。使用内置 imagegen；原件1254×1254，运行时WebP768×768，仅作尺寸/编码压缩。原件：`/Users/zjz/.codex/generated_images/01a17795-8d0f-7ab1-b17c-c475e8a57580/exec-823f0a8e-3355-4ab7-8962-13345b7dbae8.png`。

```text
Use case: stylized-concept. Asset type: original seamless PBR-style material for a premium poker game table's padded leather rail. One square evenly lit top-down close material swatch of very dark chocolate-black leather with refined natural pebble grain, subtle satin sheen and realistic fine pores, gently padded quality, luxury quiet game-art material. Palette near #171613 to #343025, neutral so game lighting can tint it green. Small grain, no large wrinkles, no stitching, no seams, no table edges, no objects, no collage, no logos, no text, no watermark, no perspective. Full frame is uniform seamless edge-to-edge leather texture. Detailed, photorealistic material scan quality.
```
