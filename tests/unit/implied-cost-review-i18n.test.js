import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import overrides from '../../src/i18n/overrides.json' with { type: 'json' };

const sources = [
  '按当前范围估计，这次跟注还需要{0}后从较弱牌收取筹码。',
  '{0}后的额外收入取决于较弱牌是否愿意付费。',
  '当前有{0}，共 {1} 张直接成牌候选；跟注后可看完转牌和河牌，至少出现一张当前候选牌的机会约 {2}，这不是最终获胜概率。',
];
// Fixed expected presentation text: regression boundaries, not independent linguistic review.
const truth = {
  en: {
    templates: [
      'Based on the current range estimate, this call still needs to earn chips from weaker hands after {0}.',
      'Extra chips won after {0} depend on whether weaker hands are willing to pay.',
      'Current draw: {0}, with {1} direct completion cards. Calling lets you see both turn and river; the chance of seeing at least one of these current candidates is about {2}, which is not the final chance of winning.',
    ],
    improvements: ['completing the draw', 'hitting a set'],
  },
  'zh-TW': {
    templates: [
      '按目前範圍估計，這次跟注仍需要{0}後從較弱牌收取籌碼。',
      '{0}後的額外收入取決於較弱牌是否願意付費。',
      '目前有{0}，共 {1} 張直接成牌候選；跟注後可看完轉牌和河牌，至少出現一張目前候選牌的機會約 {2}，這不是最終獲勝機率。',
    ],
    improvements: ['補中', '擊中暗三條'],
  },
  ja: {
    templates: [
      '現在のレンジ推定では、このコールを成り立たせるには{0}後に弱いハンドからさらにチップを得る必要があります。',
      '{0}後に得られる追加チップは、弱いハンドが支払いに応じるかどうかによります。',
      '現在は{0}で、直接完成につながる候補は {1} 枚です。コール後はターンとリバーの両方を見られ、現在の候補が少なくとも 1 枚出る確率は約 {2} です。これは最終的な勝率ではありません。',
    ],
    improvements: ['ドロー完成', 'セット完成'],
  },
  ko: {
    templates: [
      '현재 범위 추정에 따르면, 이 콜이 성립하려면 {0} 후 더 약한 패에서 추가 칩을 얻어야 합니다.',
      '{0} 후 얻을 추가 칩은 더 약한 패가 지불할 의향이 있는지에 달려 있습니다.',
      '현재 {0}이며 직접 완성 후보는 {1}장입니다. 콜하면 턴과 리버를 모두 볼 수 있고, 현재 후보 중 적어도 한 장이 나올 확률은 약 {2}입니다. 이는 최종 승리 확률이 아닙니다.',
    ],
    improvements: ['드로 완성', '셋 완성'],
  },
  es: {
    templates: [
      'Según la estimación actual del rango, este call aún necesita ganar fichas de manos más débiles después de {0}.',
      'Las ganancias adicionales después de {0} dependen de que las manos más débiles estén dispuestas a pagar.',
      'Ahora hay {0}, con {1} cartas candidatas que completan directamente la mano. Tras pagar, se ven turn y river; la probabilidad de que salga al menos una de estas candidatas actuales es de aproximadamente {2}, lo que no equivale a la probabilidad final de ganar.',
    ],
    improvements: ['completar el proyecto', 'ligar un trío con la pareja de mano'],
  },
  it: {
    templates: [
      'In base alla stima attuale del range, questo call richiede ancora di ottenere fiches da mani più deboli dopo {0}.',
      'I guadagni aggiuntivi dopo {0} dipendono dalla disponibilità delle mani più deboli a pagare.',
      'Attualmente c’è {0}, con {1} carte candidate che completano direttamente la mano. Dopo il call si vedono turn e river: la probabilità che esca almeno una delle candidate attuali è circa {2}, non la probabilità finale di vittoria.',
    ],
    improvements: ['aver completato il progetto', 'aver centrato un set'],
  },
  pt: {
    templates: [
      'Segundo a estimativa atual do range, este call ainda precisa ganhar fichas de mãos mais fracas após {0}.',
      'Os ganhos adicionais após {0} dependem de mãos mais fracas dispostas a pagar.',
      'Atualmente há {0}, com {1} cartas candidatas que completam diretamente a mão. Depois do call, é possível ver turn e river; a chance de sair pelo menos uma dessas candidatas atuais é de cerca de {2}, o que não é a probabilidade final de vitória.',
    ],
    improvements: ['completar o draw', 'Acertar uma trinca com o par de mão'],
  },
  de: {
    templates: [
      'Nach der aktuellen Range-Einschätzung benötigt dieser Call zusätzliche Chips von schwächeren Händen nach {0}.',
      'Zusätzliche Einnahmen nach {0} hängen davon ab, ob schwächere Hände bereit sind zu bezahlen.',
      'Aktuell liegt {0} vor, mit {1} Karten, die den Draw direkt vervollständigen. Nach dem Call werden Turn und River aufgedeckt; die Chance, mindestens eine dieser aktuellen Karten zu sehen, beträgt etwa {2}. Das ist nicht die endgültige Gewinnwahrscheinlichkeit.',
    ],
    improvements: ['einem Draw-Treffer', 'einem Set-Treffer'],
  },
  fr: {
    templates: [
      'Selon l’estimation actuelle du range, ce call doit encore rapporter des jetons de mains plus faibles après {0}.',
      'Les gains supplémentaires après {0} dépendent de la volonté des mains plus faibles de payer.',
      'Actuellement, {0} offre {1} cartes candidates qui complètent directement la main. Après le call, on voit le turn et la river ; la probabilité de voir au moins une de ces candidates actuelles est d’environ {2}, ce qui n’est pas la probabilité finale de gagner.',
    ],
    improvements: ['avoir complété le tirage', 'avoir touché un brelan avec une paire en main'],
  },
  ru: {
    templates: [
      'По текущей оценке диапазона этот колл всё ещё требует получения фишек от более слабых рук после {0}.',
      'Дополнительный доход после {0} зависит от готовности более слабых рук платить.',
      'Сейчас есть {0}, прямых карт для завершения — {1}. После колла будут открыты тёрн и ривер; вероятность увидеть хотя бы одну из текущих карт-кандидатов составляет около {2}, но это не итоговая вероятность победы.',
    ],
    improvements: ['закрытия дро', 'попадания в сет'],
  },
};

const fill = (template, values) => template.replace(/\{(\d+)\}/g, (_, index) => values[index]);

test('short implied-income and closed-flop templates are extracted with every dynamic value preserved', () => {
  const extracted = JSON.parse(
    readFileSync(new URL('../../src/i18n/messages.json', import.meta.url), 'utf8'),
  );
  const slots = (text) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
  assert.deepEqual(
    Object.keys(truth),
    SUPPORTED_LOCALES.filter((locale) => locale !== 'zh-CN'),
  );
  for (const [index, source] of sources.entries()) {
    assert.ok(extracted.includes(source), `Source inventory missing: ${source}`);
    for (const [locale, expected] of Object.entries(truth)) {
      assert.equal(
        overrides[locale][source],
        expected.templates[index],
        `${locale}: translated fact changed`,
      );
      assert.deepEqual(
        slots(expected.templates[index]),
        slots(source),
        `${locale}: placeholder changed`,
      );
    }
  }
});

test('both draw completion and hitting a set keep the range and willingness-to-pay conditions in all eleven locales', async () => {
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const [improvementIndex, improvement] of ['补中', '中暗三条'].entries()) {
        for (const index of [0, 1]) {
          const source = fill(sources[index], [improvement]);
          const value = localizeText(source);
          const expected =
            locale === 'zh-CN'
              ? source
              : fill(truth[locale].templates[index], [
                  truth[locale].improvements[improvementIndex],
                ]);
          assert.equal(value, expected, `${locale}: ${source}`);
          assert.doesNotMatch(value, /\{\d+\}/);
          if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
            assert.doesNotMatch(value, /\p{Script=Han}/u, locale);
          if (locale === 'en') {
            assert.match(
              value,
              index
                ? /depend on whether weaker hands are willing to pay/
                : /current range estimate.*needs to earn chips from weaker hands/,
            );
            assert.doesNotMatch(
              value,
              /next street|another bet|current betting round|guaranteed|certainly/i,
            );
          }
        }
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

test('closed flop text retains both remaining cards, fixed candidate count and probability without equating it to winning', async () => {
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      const source = fill(sources[2], ['同花听牌', '9', '35.0%']);
      const value = localizeText(source);
      const expected =
        locale === 'zh-CN'
          ? source
          : fill(truth[locale].templates[2], [localizeText('同花听牌'), '9', '35.0%']);
      assert.equal(value, expected, locale);
      assert.equal(value.match(/35\.0%/g)?.length, 1, `${locale}: probability changed`);
      assert.ok(value.includes('9'), `${locale}: candidate count changed`);
      assert.doesNotMatch(value, /\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(value, /\p{Script=Han}/u, locale);
      if (locale === 'en')
        assert.match(
          value,
          /both turn and river.*at least one.*about 35\.0%.*not the final chance of winning/,
        );
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

const pairAccuracySources = [
  '{0} 落下时，底牌有机会组成更高的一对，但这些牌也不能全部算成必胜补牌。',
  '跟注需要对手范围里有足够较弱牌或诈唬；面对更紧范围应弃牌。',
];
const pairAccuracyTruth = {
  en: [
    'If {0} falls, one of the hole cards may make a higher pair, but these cards cannot all be counted as guaranteed winning outs.',
    'Calling requires enough weaker hands or bluffs in the opponent’s range; fold against a tighter range.',
  ],
  'zh-TW': [
    '當 {0} 發出時，底牌有機會組成更高的一對，但這些牌也不能全部算成必勝補牌。',
    '跟注需要對手範圍裡有足夠較弱牌或詐唬；面對更緊範圍應棄牌。',
  ],
  ja: [
    '{0}が出ると、ホールカードがより高いワンペアになる可能性があります。ただし、これらすべてを確実に勝てるアウツとは数えられません。',
    'コールするには、相手のレンジに弱いハンドやブラフが十分含まれている必要があります。よりタイトなレンジが相手ならフォールドすべきです。',
  ],
  ko: [
    '{0} 카드가 나오면 홀 카드가 더 높은 원페어를 만들 가능성이 있지만, 이 카드들을 모두 승리가 확실한 아웃으로 셀 수는 없습니다.',
    '콜하려면 상대 범위에 더 약한 패나 블러프가 충분히 있어야 합니다. 더 타이트한 범위에는 폴드해야 합니다.',
  ],
  es: [
    'Si sale {0}, las cartas de mano pueden formar una pareja más alta, pero no todas estas cartas se pueden contar como outs que aseguren ganar.',
    'Para pagar, el rango rival debe incluir suficientes manos más débiles o faroles; frente a un rango más cerrado, se debe abandonar la mano.',
  ],
  it: [
    'Se esce {0}, le carte in mano possono formare una coppia più alta, ma queste carte non sono tutte out che garantiscono la vittoria.',
    'Il call richiede che il range avversario contenga abbastanza mani più deboli o bluff; contro un range più stretto bisogna foldare.',
  ],
  pt: [
    'Se vier {0}, as cartas da mão podem formar um par mais alto, mas nem todas essas cartas podem ser contadas como outs que garantem a vitória.',
    'Para pagar, o range do adversário precisa ter mãos mais fracas ou blefes em quantidade suficiente; contra um range mais fechado, deve-se desistir.',
  ],
  de: [
    'Wenn {0} fällt, können die Hole Cards ein höheres Paar bilden. Diese Karten zählen aber nicht alle als sichere Gewinn-Outs.',
    'Ein Call setzt genügend schwächere Hände oder Bluffs in der gegnerischen Range voraus; gegen eine engere Range sollte man folden.',
  ],
  fr: [
    'Si {0} tombe, les cartes privatives peuvent former une paire plus haute, mais ces cartes ne sont pas toutes des outs garantissant la victoire.',
    'Pour suivre, le range adverse doit contenir assez de mains plus faibles ou de bluffs ; face à un range plus serré, il faut se coucher.',
  ],
  ru: [
    'Если выйдет {0}, карманные карты могут образовать более высокую пару, но не все эти карты можно считать гарантированно победными аутами.',
    'Для колла в диапазоне соперника должно быть достаточно более слабых рук или блефов; против более тайтового диапазона следует сбросить.',
  ],
};

test('higher-pair and tighter-range revisions preserve exact facts and rank placeholders across all eleven locales', async () => {
  const extracted = JSON.parse(
    readFileSync(new URL('../../src/i18n/messages.json', import.meta.url), 'utf8'),
  );
  const slots = (text) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
  assert.deepEqual(
    Object.keys(pairAccuracyTruth),
    SUPPORTED_LOCALES.filter((locale) => locale !== 'zh-CN'),
  );
  for (const source of pairAccuracySources)
    assert.ok(extracted.includes(source), `Source missing: ${source}`);
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const [index, source] of pairAccuracySources.entries()) {
        if (locale !== 'zh-CN') {
          assert.equal(
            overrides[locale][source],
            pairAccuracyTruth[locale][index],
            `${locale}: fact changed`,
          );
          assert.deepEqual(
            slots(pairAccuracyTruth[locale][index]),
            slots(source),
            `${locale}: rank placeholder changed`,
          );
        }
        for (const rank of ['A', 'K / Q']) {
          const value = localizeText(fill(source, [rank]));
          const expected = fill(locale === 'zh-CN' ? source : pairAccuracyTruth[locale][index], [
            rank,
          ]);
          assert.equal(value, expected, `${locale}: ${source}`);
          assert.doesNotMatch(value, /\{\d+\}/);
          if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
            assert.doesNotMatch(value, /\p{Script=Han}/u, locale);
          if (index === 0) assert.ok(value.includes(rank), `${locale}: rank text lost`);
          if (locale === 'en') {
            if (index === 0) {
              assert.match(value, /may make a higher pair.*cannot all.*guaranteed winning outs/);
              assert.doesNotMatch(value, /top pair|certain to win|guarantees a win/i);
            } else {
              assert.match(
                value,
                /requires enough weaker hands or bluffs.*fold against a tighter range/,
              );
              assert.doesNotMatch(
                value,
                /draw|improve|next street|current round|showdown potential/i,
              );
            }
          }
        }
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

const drawRouteSource = '听牌是主要改善路径，底牌成对或赢过未成牌诈唬也可能获胜。';
const drawRouteTruth = {
  en: 'The draw is the main path to improvement, but pairing a hole card or beating an unmade bluff may also win.',
  'zh-TW': '聽牌是主要改善路徑，底牌成對或贏過未成牌詐唬也可能獲勝。',
  ja: '主な改善手段はドローですが、ホールカードがペアになったり、未完成のブラフに勝ったりする可能性もあります。',
  ko: '드로가 주된 개선 경로이지만 홀 카드가 페어를 이루거나 미완성 패의 블러프를 이겨 승리할 수도 있습니다.',
  es: 'El proyecto es la principal vía de mejora, pero también se puede ganar formando una pareja con una carta propia o superando faroles sin mano hecha.',
  it: 'Il progetto è la via principale per migliorare, ma si può vincere anche formando una coppia con una carta privata o battendo bluff senza una mano formata.',
  pt: 'O projeto é o principal caminho de melhora, mas também é possível vencer formando um par com uma carta da mão ou superando blefes sem mão formada.',
  de: 'Der Draw ist der wichtigste Weg zur Verbesserung. Die Hand kann aber auch durch ein Paar mit einer Holecard oder gegen einen Bluff ohne fertige Hand gewinnen.',
  fr: 'Le tirage est la principale voie d’amélioration, mais former une paire avec une carte privative ou battre un bluff sans main faite peut aussi permettre de gagner.',
  ru: 'Дро — основной путь к усилению, но можно также выиграть, собрав пару с карманной картой или обыграв блеф без готовой руки.',
};

test('short draw-path explanation retains pairing and bluff-catching routes without repeating the separate equity warning', async () => {
  const extracted = JSON.parse(
    readFileSync(new URL('../../src/i18n/messages.json', import.meta.url), 'utf8'),
  );
  assert.ok(extracted.includes(drawRouteSource));
  assert.deepEqual(
    Object.keys(drawRouteTruth),
    SUPPORTED_LOCALES.filter((locale) => locale !== 'zh-CN'),
  );
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      const value = localizeText(drawRouteSource);
      assert.equal(value, locale === 'zh-CN' ? drawRouteSource : drawRouteTruth[locale], locale);
      assert.doesNotMatch(value, /\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(value, /\p{Script=Han}/u, locale);
      if (locale === 'en') {
        assert.match(
          value,
          /draw.*main path.*pairing a hole card.*beating an unmade bluff.*may also win/,
        );
        assert.doesNotMatch(value, /equity|chance of hitting|not.*winning probability|guarantee/i);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

const riverVisibilitySource = '本轮跟注后即可看到最后一张河牌。';
const riverVisibilityTruth = {
  en: 'Calling this round lets you see the river, the last community card.',
  'zh-TW': '本輪跟注後即可看到最後一張河牌。',
  ja: 'このラウンドでコールすれば、最後のコミュニティカードであるリバーを見ることができます。',
  ko: '이번 라운드에 콜하면 마지막 공용 카드인 리버를 볼 수 있습니다.',
  es: 'Al pagar en esta ronda, puedes ver la última carta comunitaria, el river.',
  it: 'Chiamando in questo giro, puoi vedere l’ultima carta comune, il river.',
  pt: 'Ao pagar nesta rodada, você pode ver a última carta comunitária, o river.',
  de: 'Mit einem Call in dieser Runde siehst du die letzte Gemeinschaftskarte, den River.',
  fr: 'Suivre dans ce tour permet de voir la dernière carte commune, la river.',
  ru: 'После колла в этом круге можно увидеть последнюю общую карту — ривер.',
};

test('a closing turn call fact promises the river card without inventing free river action or automatic showdown', async () => {
  const extracted = JSON.parse(
    readFileSync(new URL('../../src/i18n/messages.json', import.meta.url), 'utf8'),
  );
  assert.ok(extracted.includes(riverVisibilitySource));
  assert.deepEqual(
    Object.keys(riverVisibilityTruth),
    SUPPORTED_LOCALES.filter((locale) => locale !== 'zh-CN'),
  );
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      const value = localizeText(riverVisibilitySource);
      assert.equal(
        value,
        locale === 'zh-CN' ? riverVisibilitySource : riverVisibilityTruth[locale],
        locale,
      );
      assert.doesNotMatch(value, /\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(value, /\p{Script=Han}/u, locale);
      if (locale === 'en') {
        assert.match(value, /Calling this round.*see the river.*last community card/);
        assert.doesNotMatch(value, /free|showdown|without.*bet|no further|all-in|guaranteed win/i);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});
