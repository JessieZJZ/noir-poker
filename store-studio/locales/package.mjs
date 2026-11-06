import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { catalog } from "./catalog.mjs";
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(studio);
const out = path.resolve(
  process.argv[2] || path.join(root, ".artifacts/store-media-v6/delivery"),
);
const review = {
  "zh-CN":
    "无需账号即可使用。应用提供离线德州扑克练习，仅使用虚拟筹码。\n\n从顶部菜单进入新手引导。完成一手正常对局后，点击“复盘”查看分析，或点击“重打本手”用相同牌序尝试另一种决策。\n\n在顶部菜单中打开“对局记录”，选择一手牌查看详情。“胜率计算器”支持选择底牌与公共牌，实时显示胜率、平局率和 Outs。\n\n没有真钱下注、筹码购买、兑换或现金奖励。复盘为基于公开信息、假设范围和模拟估计的练习建议。",
  en: "No account is required. This is an offline Texas Hold’em practice app using virtual chips only.\n\nOpen the tutorial from the top menu. After a normal hand ends, tap Review for the analysis or Replay hand to try another decision with the original deal.\n\nOpen Game records from the menu, then select a hand for its details. The win-rate calculator updates win, tie and outs as you choose hole cards and community cards.\n\nThere is no real-money betting, chip purchasing, cash-out or cash reward. Review advice uses public information, assumed ranges and simulation estimates for practice.",
  "zh-TW":
    "不需註冊帳號。這是一款離線的德州撲克練習 App，僅使用虛擬籌碼。\n\n從頂部選單進入新手教學。完成一手正常對局後，可開啟復盤查看分析，或重打本手，用相同牌序試試另一種選擇。\n\n從選單開啟對局紀錄，再選一手牌查看細節。勝率計算器會隨底牌與公共牌的選擇，即時更新勝率、平手率和 Outs 補牌。\n\n沒有現金下注、籌碼購買、兌換或現金獎勵。復盤採用公開資訊、假設範圍與模擬估計，作為練習參考。",
  ja: "アカウント登録は不要です。オフラインでテキサスホールデムを練習するアプリで、使用するのはバーチャルチップのみです。\n\n上部のメニューからチュートリアルを開けます。通常のハンドが終わったらレビューで分析を確認するか、同じ配りをやり直して別の選択を試せます。\n\nメニューのプレイ履歴からハンドを選ぶと、詳細を確認できます。勝率計算ではホールカードとコミュニティカードを選ぶと、勝率、引き分け率、アウツが更新されます。\n\n現金を賭ける機能、チップの購入や換金、現金の賞金はありません。レビューは公開情報、想定レンジ、シミュレーションによる推定に基づく練習用の助言です。",
  ko: "계정 없이 사용할 수 있는 오프라인 텍사스 홀덤 연습 앱입니다. 가상 칩만 사용합니다.\n\n상단 메뉴에서 튜토리얼을 시작할 수 있습니다. 일반 핸드가 끝나면 복기를 열어 분석을 확인하거나, 같은 카드 순서로 다시 플레이하며 다른 선택을 시도할 수 있습니다.\n\n메뉴의 핸드 기록에서 핸드를 선택하면 상세 내용을 볼 수 있습니다. 승률 계산기는 홀 카드와 커뮤니티 카드를 선택할 때 승률, 무승부 확률, 아웃츠를 갱신합니다.\n\n현금 베팅, 칩 구매나 환전, 현금 상금은 없습니다. 복기는 공개 정보, 가정한 핸드 범위, 시뮬레이션 추정에 기반한 연습용 조언입니다.",
  es: "No hace falta crear una cuenta. La app permite practicar Texas Hold’em sin conexión y solo utiliza fichas virtuales.\n\nEl tutorial se abre desde el menú superior. Al terminar una mano normal, abre la revisión para consultar el análisis o vuelve a jugar el mismo reparto con otra decisión.\n\nEn el historial del menú puedes elegir una mano y ver sus detalles. La calculadora actualiza las probabilidades de victoria, empate y los outs al seleccionar las cartas propias y comunitarias.\n\nNo hay apuestas con dinero real, compra o canje de fichas ni premios en efectivo. Los consejos de revisión se basan en información pública, rangos supuestos y estimaciones por simulación.",
  it: "Non serve un account. L’app permette di allenarsi a Texas Hold’em offline e usa solo fiches virtuali.\n\nIl tutorial si apre dal menu in alto. Al termine di una mano normale puoi aprire l’analisi oppure rigiocare la stessa distribuzione provando un’altra scelta.\n\nDalla cronologia nel menu, seleziona una mano per vederne i dettagli. Il calcolatore aggiorna le probabilità di vittoria, pareggio e gli outs quando scegli le carte private e comuni.\n\nNon sono previste puntate in denaro reale, acquisti o conversioni di fiches, né premi in denaro. L’analisi offre consigli per l’allenamento basati su informazioni pubbliche, range ipotizzati e stime da simulazioni.",
  pt: "Não é preciso criar uma conta. O app permite treinar Texas Hold’em offline e usa apenas fichas virtuais.\n\nO tutorial fica no menu superior. Depois de uma mão normal, abra a análise ou jogue a mesma distribuição de novo para testar outra decisão.\n\nNo histórico do menu, escolha uma mão para ver os detalhes. A calculadora atualiza as chances de vitória, empate e os outs conforme você escolhe as cartas da mão e da mesa.\n\nNão há apostas com dinheiro real, compra ou troca de fichas por dinheiro, nem prêmios em dinheiro. A análise oferece orientações de treino com base em informações públicas, ranges presumidos e estimativas por simulação.",
  de: "Es ist kein Konto erforderlich. Die App bietet Offline-Training für Texas Hold’em und verwendet ausschließlich virtuelle Chips.\n\nDas Tutorial lässt sich über das Menü oben öffnen. Nach einer regulären Hand kannst du die Analyse ansehen oder dieselbe Kartenverteilung erneut spielen und eine andere Entscheidung ausprobieren.\n\nIm Spielverlauf des Menüs kannst du eine Hand auswählen und die Details ansehen. Der Rechner aktualisiert Gewinn- und Teilungswahrscheinlichkeit sowie Outs, sobald du Hand- und Gemeinschaftskarten auswählst.\n\nEs gibt keine Echtgeld-Einsätze, Chipkäufe, Auszahlungen oder Geldpreise. Die Trainingshinweise beruhen auf öffentlichen Informationen, angenommenen Ranges und Simulationsschätzungen.",
  fr: "Aucun compte n’est nécessaire. L’application permet de s’entraîner au Texas Hold’em hors ligne avec des jetons virtuels uniquement.\n\nLe tutoriel est accessible depuis le menu en haut. Après une main normale, ouvrez l’analyse ou rejouez la même donne pour essayer une autre décision.\n\nDans l’historique du menu, sélectionnez une main pour consulter ses détails. Le calculateur actualise les chances de victoire, de partage du pot et les outs lorsque vous choisissez les cartes privatives et communes.\n\nIl n’y a ni mise d’argent réel, ni achat ou conversion de jetons, ni prix en argent. Les conseils reposent sur les informations publiques, des ranges supposées et des estimations par simulation.",
  ru: "Регистрация не нужна. Приложение позволяет тренироваться в техасском холдеме офлайн и использует только виртуальные фишки.\n\nОбучение открывается через верхнее меню. После обычной раздачи можно открыть разбор или переиграть ту же раздачу, выбрав другое действие.\n\nВ истории из меню выберите раздачу, чтобы посмотреть подробности. Калькулятор обновляет вероятность победы, дележа банка и ауты при выборе карманных карт и карт борда.\n\nНет ставок на реальные деньги, покупки или обмена фишек на деньги и денежных призов. Советы для тренировки основаны на открытой информации, предполагаемых диапазонах и оценках симуляции.",
};
const put = (name, text) => {
  fs.mkdirSync(path.dirname(name), { recursive: true });
  fs.writeFileSync(name, text + "\n");
};
const rows = [];
for (const c of Object.values(catalog)) {
  const dir = path.join(out, c.locale),
    fields = {
      apple: {
        name: c.appName,
        subtitle: c.subtitle,
        "promotional-text": c.promo,
        description: c.description,
        keywords: c.keywords,
        "review-notes": review[c.locale],
      },
      google: {
        name: c.appName,
        "short-description": c.short,
        "full-description": c.description,
      },
    };
  const limits = {
    name: 30,
    subtitle: 30,
    "promotional-text": 170,
    description: 4000,
    keywords: 100,
    "short-description": 80,
    "full-description": 4000,
  };
  const counts = [];
  for (const [store, data] of Object.entries(fields))
    for (const [key, value] of Object.entries(data)) {
      const chars = [...value].length,
        bytes = Buffer.byteLength(value);
      if (limits[key] && chars > limits[key])
        throw Error(c.locale + " " + key + " exceeds " + limits[key]);
      if (key === "keywords" && bytes > 100)
        throw Error("Keywords exceed conservative 100-byte limit");
      put(path.join(dir, store, "text", key + ".txt"), value);
      counts.push({
        store,
        field: key,
        characters: chars,
        utf8Bytes: bytes,
        limit: limits[key] || null,
      });
    }
  put(
    path.join(dir, "video", "narration.txt"),
    c.say.map((s, i) => String(i + 1).padStart(2, "0") + " | " + s).join("\n"),
  );
  put(
    path.join(dir, "captions-and-screenshots.csv"),
    "file,headline,detail\n" +
      c.cards
        .map((card, i) =>
          [String(i + 1).padStart(2, "0") + ".png", ...card]
            .map(
              (v) => '"' + v.replaceAll('"', '""').replaceAll("\n", " ") + '"',
            )
            .join(","),
        )
        .join("\n"),
  );
  put(
    path.join(dir, "field-validation.json"),
    JSON.stringify(
      {
        locale: c.locale,
        appleLocale: c.apple,
        googleLocale: c.google,
        fields: counts,
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(path.join(dir, "google"), { recursive: true });
  fs.mkdirSync(path.join(dir, "apple"), { recursive: true });
  await sharp(path.join(studio, "public/assets/app-icon.png"))
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, "google/icon-512.png"));
  await sharp(path.join(studio, "public/assets/app-icon.png"))
    .resize(1024, 1024)
    .flatten({ background: "#0b1017" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, "apple/icon-1024.png"));
  put(
    path.join(dir, "README-填写指南.md"),
    `# NOIR Poker · ${c.label} (${c.locale})

本包的公开文案、海报标题、字幕和旁白均对应本语言。品牌名 NOIR Poker 保持一致。
Apple 语言代码：${c.apple}。Google Play 语言代码：${c.google}。

## Google Play 表单对应文件

- 应用名称、简短说明、完整说明：google/text/ 中同名独立 txt，可直接复制。
- 应用图标：google/icon-512.png，512×512。
- 置顶大图：google/feature-graphic.png，1024×500。
- 手机截图：google/phone/，8 张 1080×1920。
- 7 英寸平板截图：google/tablet-7/，8 张 1920×1080。
- 10 英寸平板截图：google/tablet-10/，8 张 1920×1080。
- 桌面画面：google/desktop/，8 张 1920×1080，为实际生产 Web 桌面界面；仅在桌面发行体验与其一致时用于对应资源栏，未验证 Google Play Games on PC 的原生发行版本。

手机与两档 Android 平板图片使用实际安装 APK 的界面。平板按两套原生模拟器窗口尺寸和密度分别采集；不是把手机截图拉宽。

## Apple 表单对应文件

- 名称、副标题、推广文本、描述、关键词：apple/text/ 中的独立 txt。
- 审核说明：apple/text/review-notes.txt；实际提供给审核人员前，可保留英文作为辅助。
- 图标：apple/icon-1024.png。
- iPhone 大图：apple/iphone-large/，1290×2796，8 张。
- iPhone 另一档：apple/iphone-medium/，1206×2622，8 张。同一版式适配画布，界面未被拉伸。
- iPad：apple/ipad-13/，2752×2064，8 张，使用实际安装 iOS App 的 iPad 界面。

## 共用横屏视频

- video/shared-preview.mp4：1920×886，30fps，29.8 秒；Apple App Preview 与 Google 的介绍视频共用这一剪辑。
- video/master-3840.mp4：3840×1772 高清母版，供大屏查看与后续编辑。Apple 请使用上面的标准文件。
- video/poster.png：视频封面预览。
- video/poster-store-1920x886.png：标准尺寸封面；Apple 后台也可直接从视频选帧。
- video/youtube-thumbnail-1280x720.png：YouTube 缩略图。
- video/captions.srt：本语言字幕；视频已有画内字幕，另加字幕时避免重复显示。
- video/narration.txt：六个分镜的本语言旁白。

Apple 上传视频文件；Google Play 的视频栏填写公开或不公开的 YouTube 视频链接，需要先把本语言视频上传到自己的 YouTube。这里不代为发布。

## 画面顺序

八张截图：离线牌桌、新手引导、复盘、重打、胜率与 Outs、对手风格、对局记录、记录详情。
视频：新手引导 → 本手动态 → 复盘 → 重打改决策 → 对局记录与详情 → 胜率与 Outs。

实际录制来自 PR70 对应产品代码；没有注入测试牌局或在截图上伪造 App 文案。新增宣传表达作了本地化改写。原有 App 界面仍以实际版本为准；这不等于第三方母语人员已完成人工审校。

## 说明

本包用于商店素材填写，不包含签名安装包、隐私政策/支持网址配置、评级问卷或发布凭据。已有网址请使用实际可访问的最终地址。
图片规格与文案长度见 field-validation.json 和共享验收报告。全部素材尚未上传商店。

参考规格：
https://support.google.com/googleplay/android-developer/answer/9866151
https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/
`,
  );
  rows.push({
    locale: c.locale,
    label: c.label,
    apple: c.apple,
    google: c.google,
  });
}
put(path.join(out, "语言与上传索引.json"), JSON.stringify(rows, null, 2));
console.log("Prepared field text and icons for " + rows.length + " locales");
