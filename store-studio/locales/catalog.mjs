import fs from "node:fs";
const old = JSON.parse(
  fs.readFileSync(new URL("../listings.json", import.meta.url)),
);
const items = [
  {
    locale: "zh-TW",
    label: "繁體中文",
    apple: "zh-Hant",
    google: "zh-TW",
    voice: "zh-TW-HsiaoChenNeural",
    subtitle: "離線練牌，復盤每個選擇",
    short: "離線練習德州撲克，從新手教學到牌局復盤，用同一手牌試出不同選擇。",
    promo:
      "用自己的步調練習德州撲克。跟著互動教學入門，打完一手再看懂決策，還能重打同一副牌，試試不同的打法。",
    keywords: "德州撲克,撲克,離線,練習,策略,復盤,勝率,補牌,教學,牌局",
    head: [
      "跟著實戰，\n學會規則。",
      "每步行動，\n即時掌握。",
      "打開復盤，\n看懂理由。",
      "重打原牌，\n換個選擇。",
      "對局紀錄，\n隨時回看。",
      "勝率與補牌，\n一眼看清。",
    ],
    lead: [
      "從互動教學\n到自己完成一手牌",
      "正常對局時往下滑\n查看即時更新的本手動態",
      "一手結束，點選復盤\n理解當時的資訊與決策依據",
      "結算後點選「重打這手牌」\n用原來的牌嘗試不同打法",
      "從選單開啟對局紀錄\n再查看這一手的完整過程",
      "勝率 56.06% · 補牌 16 張\n看看哪些牌能讓你取得領先",
    ],
    say: [
      "跟著互動教學，輕鬆學會規則。",
      "每一步行動，本手動態即時記錄。",
      "打完一手，打開復盤，理解决策。",
      "重新打同一副牌，試試不同的選擇。",
      "打開對局紀錄，隨時回看每手細節。",
      "看清勝率，也看看哪些補牌能逆轉。",
    ],
    cards: [
      ["每一手，\n練出更好的判斷。", "離線練習德州撲克，照自己的步調來"],
      ["從第一手，\n學會怎麼打。", "互動教學帶你入門，再自己上桌練習"],
      ["看懂行動，\n找到決策依據。", "結合當時的資訊，理解選擇與代價"],
      ["同一副牌，\n再試另一種打法。", "重現原本的牌序與起始籌碼"],
      ["勝率與補牌，\n不再只憑感覺。", "查看勝率、平手率與可能逆轉的補牌"],
      ["不同對手，\n練出不同思路。", "八種對手風格，三段難度"],
      ["練過的牌，\n每手都有紀錄。", "在裝置上查看儲存的對局紀錄"],
      ["回到當時，\n看清完整過程。", "回看牌桌、結算與每一步行動"],
    ],
    feature: "每一手，\n練習更好的判斷。",
    tag: "離線德州撲克練習",
    footer: "離線練習 · 虛擬籌碼",
    ribbon: "讓每次練習都有收穫",
    description: `每一手，都能成為下一次判斷的養分。

NOIR Poker 是一款離線的無限注德州撲克練習 App。和電腦對手對局，透過互動教學熟悉規則，再回頭看懂關鍵選擇。不用註冊帳號。

從教學開始，慢慢找到節奏
新手教學帶你認識底牌、位置、盲注、各輪下注、加注、棄牌、全下與邊池。完成引導後，自己打一手，把剛學到的觀念用出來。

在牌桌上練習判斷
支援 5 至 9 人牌桌、三段難度和八種對手風格。練習調整下注尺度，觀察公開行動，適應不同的對手。對局中也能查看牌型與提示。

打完一手，再看懂理由
復盤會依據決策前可見的資訊、跟注代價與假設的對手範圍，說明自己與對手的行動。分析採用啟發式方法與模擬估計，供練習參考。

同一副牌，重新選一次
「重打這手牌」會恢復原本的底牌、發牌順序與起始籌碼。試試另一條路線，比較不同選擇帶來的過程，而不是只看輸贏。

讓機率與過程都看得見
設定底牌與公共牌，查看勝率、平手率及 Outs 補牌。對局紀錄儲存在本機，之後仍可回看每手的牌桌、結算與行動。

僅使用虛擬籌碼，無現金價值；籌碼不能購買或兌換，沒有現金下注或獎金。`,
  },
  {
    locale: "ja",
    label: "日本語",
    apple: "ja",
    google: "ja-JP",
    voice: "ja-JP-NanamiNeural",
    subtitle: "オフラインで学ぶテキサスホールデム",
    short:
      "オフラインでホールデムを練習。ハンドを振り返り、同じ配りで別の打ち方を試せます。",
    promo:
      "一手ずつ、判断を磨こう。チュートリアルで基礎を学び、ハンドレビューで考え方を整理。同じ配りをやり直して、別の選択肢を試せます。",
    keywords:
      "ポーカー,テキサスホールデム,オフライン,練習,戦略,勝率,オッズ,アウツ",
    head: [
      "実際に打って、\nルールを覚える。",
      "ハンドの流れを、\nその場で確認。",
      "レビューで、\n判断の理由を知る。",
      "同じ配りで、\n別の選択を。",
      "プレイ履歴から、\nあの一手へ。",
      "勝率とアウツを、\nひと目で。",
    ],
    lead: [
      "ガイドに沿って学び\n自分の力で一手をプレイ",
      "プレイ中のアクションを\nハンド履歴でリアルタイムに確認",
      "ハンド終了後にレビューを開く\nその時点の情報から判断を振り返る",
      "「このハンドをもう一度プレイ」をタップ\n同じカードで違う打ち方を試す",
      "メニューからプレイ履歴へ\nハンドを選んで詳細を確認",
      "勝率 56.06% · アウツ 16 枚\n逆転につながるカードを確認",
    ],
    say: [
      "ガイドに沿って、ルールを覚えましょう。",
      "ハンドの流れを、リアルタイムで確認。",
      "レビューを開いて、判断の理由を確認。",
      "同じ配りで、別の打ち方を試しましょう。",
      "プレイ履歴から、各ハンドを振り返れます。",
      "勝率と、逆転につながるアウツを確認。",
    ],
    cards: [
      ["一手ずつ、\n判断を磨く。", "自分のペースで、オフライン練習"],
      ["打ちながら、\n基礎を身につける。", "ガイド付きのハンドから実践へ"],
      ["その判断には、\nどんな理由が？", "当時の情報をもとに選択を振り返る"],
      ["同じカードで、\nもう一つの選択。", "元の配りと開始時のチップを再現"],
      ["勝率とアウツを、\n見える形に。", "勝率・引き分け率・アウツを確認"],
      ["相手が変われば、\n考え方も変わる。", "8種類のスタイルと3段階の難易度"],
      [
        "練習したハンドを、\nいつでも見返す。",
        "端末に保存したプレイ履歴を確認",
      ],
      [
        "あの一手の、\n流れをもう一度。",
        "テーブル・結果・アクションを振り返る",
      ],
    ],
    feature: "一手ずつ、\n判断を磨こう。",
    tag: "オフラインでホールデム練習",
    footer: "オフライン練習 · バーチャルチップ",
    ribbon: "考えながら、上達する",
    description: `一手ごとに、次の判断が少し見えてくる。

NOIR Poker は、オフラインでノーリミット・テキサスホールデムを練習できるアプリです。コンピューターの相手と対戦し、ガイド付きのハンドで基本を学び、気になった場面をあとから振り返れます。アカウント登録は不要です。

打ちながらルールを身につける
チュートリアルでは、ホールカード、ポジション、ブラインド、各ベッティングラウンド、レイズ、フォールド、オールイン、サイドポットを順に体験。ガイドを終えたら、自分の判断で一手をプレイします。

自分のペースで実践
5〜9人卓、3段階の難易度、8種類の相手スタイルを用意。ベット額の調整や相手の公開アクションの読み取りを、繰り返し練習できます。プレイ中にはヒントや役一覧も確認できます。

結果だけでなく、判断を振り返る
ハンドレビューでは、その判断より前に見えていた情報、コールに必要な額、想定する相手のレンジをもとに、自分と相手のアクションを考察します。助言はヒューリスティックとシミュレーションによる推定で、練習の目安として利用できます。

同じ配りで、違う選択を
ハンドをやり直すと、元のホールカード、配り順、開始時のチップを再現。別の打ち方を試して、展開を比較できます。

勝率も履歴も、手元で確認
カードを指定して勝率、引き分け率、アウツを計算。プレイ履歴は端末に保存され、テーブル、結果、各アクションをあとから見返せます。

使用するのは現金価値のないバーチャルチップのみ。チップの購入・換金、現金の賭け、賞金はありません。`,
  },
  {
    locale: "ko",
    label: "한국어",
    apple: "ko",
    google: "ko-KR",
    voice: "ko-KR-SunHiNeural",
    subtitle: "오프라인 홀덤 연습과 핸드 복기",
    short:
      "오프라인으로 홀덤을 연습하고 핸드를 복기하세요. 같은 패로 다시 플레이하며 다른 선택을 시험할 수 있습니다.",
    promo:
      "한 핸드씩 판단을 다듬어 보세요. 튜토리얼로 기본을 익히고, 복기로 선택의 이유를 살펴본 뒤 같은 패에서 다른 플레이를 시도할 수 있습니다.",
    keywords: "포커,홀덤,텍사스홀덤,오프라인,연습,복기,전략,승률,아웃츠",
    head: [
      "직접 플레이하며\n규칙을 익혀요.",
      "진행 중인 핸드를\n실시간으로 확인해요.",
      "복기를 열어\n선택의 이유를 봐요.",
      "같은 패로\n다르게 플레이해요.",
      "핸드 기록으로\n다시 돌아가요.",
      "승률과 아웃츠를\n한눈에 확인해요.",
    ],
    lead: [
      "튜토리얼을 따라 익히고\n직접 한 핸드를 플레이해요",
      "아래로 스크롤해\n핸드의 행동 기록을 실시간으로 확인해요",
      "핸드가 끝나면 복기를 열어\n당시 정보와 판단 근거를 살펴봐요",
      "핸드 다시 플레이를 눌러\n같은 카드에서 다른 선택을 해 봐요",
      "메뉴에서 핸드 기록을 열고\n원하는 핸드의 상세 내용을 확인해요",
      "승률 56.06% · 아웃츠 16장\n어떤 카드가 역전을 만드는지 살펴봐요",
    ],
    say: [
      "튜토리얼을 따라 홀덤의 기본을 익혀요.",
      "핸드의 진행 과정을 실시간으로 확인해요.",
      "핸드가 끝나면 복기로 판단을 살펴봐요.",
      "같은 패로 다시 플레이하며 선택을 바꿔 봐요.",
      "핸드 기록에서 지난 플레이를 돌아봐요.",
      "승률과 역전을 만드는 아웃츠를 확인해요.",
    ],
    cards: [
      ["한 핸드씩,\n더 나은 판단으로.", "오프라인에서 내 속도로 홀덤 연습"],
      ["직접 해 보며\n기본을 익혀요.", "튜토리얼을 마치고 스스로 플레이하기"],
      [
        "그 선택의 이유를\n함께 살펴봐요.",
        "당시 정보를 바탕으로 판단과 비용 복기",
      ],
      ["같은 카드에서\n다른 선택을 해요.", "원래 카드 순서와 시작 칩을 복원"],
      [
        "승률과 아웃츠를\n눈으로 확인해요.",
        "승리·무승부 확률과 역전 카드 확인",
      ],
      ["상대가 달라지면\n전략도 달라져요.", "8가지 상대 스타일과 3단계 난이도"],
      ["연습한 핸드를\n기록으로 남겨요.", "기기에 저장된 핸드 기록 찾아보기"],
      [
        "그 핸드의 흐름을\n처음부터 다시 봐요.",
        "테이블, 결과, 행동 기록을 함께 확인",
      ],
    ],
    feature: "한 핸드씩,\n더 나은 판단으로.",
    tag: "오프라인 텍사스 홀덤 연습",
    footer: "오프라인 연습 · 가상 칩",
    ribbon: "한 번의 연습도 의미 있게",
    description: `한 핸드가 끝나면, 다음 선택을 위한 배움이 남습니다.

NOIR Poker는 오프라인으로 노리밋 텍사스 홀덤을 연습하는 앱입니다. 컴퓨터 상대와 플레이하고, 튜토리얼로 기본을 익힌 뒤 중요한 순간을 다시 살펴보세요. 계정을 만들 필요가 없습니다.

플레이하며 익히는 기본
튜토리얼에서 홀 카드, 포지션, 블라인드, 각 베팅 라운드, 레이즈, 폴드, 올인, 사이드 팟을 차근차근 경험합니다. 안내가 끝나면 직접 판단하며 한 핸드를 플레이할 수 있습니다.

내 속도로 하는 실전 연습
5~9인 테이블, 3단계 난이도, 8가지 상대 스타일을 지원합니다. 베팅 크기를 조절하고, 공개된 행동을 살피며 상대에 맞춰 플레이하는 연습을 해 보세요. 플레이 중 힌트와 족보도 확인할 수 있습니다.

결과보다 판단의 과정을 보는 복기
복기는 각 행동 이전에 알 수 있었던 정보, 콜 비용, 가정한 상대의 핸드 범위를 바탕으로 나와 상대의 선택을 설명합니다. 휴리스틱과 시뮬레이션 추정에 기반한 연습용 조언입니다.

같은 패로 다시 선택하기
핸드 다시 플레이는 원래 홀 카드, 카드가 나오는 순서, 시작 칩을 복원합니다. 같은 조건에서 다른 플레이를 시도하며 과정을 비교할 수 있습니다.

승률 계산과 핸드 기록
카드를 지정해 승률, 무승부 확률, 아웃츠를 확인하세요. 플레이 기록은 기기에 저장되며, 지난 핸드의 테이블과 결과, 행동 흐름을 다시 볼 수 있습니다.

가상 칩만 사용하며 현금 가치가 없습니다. 칩 구매나 환전, 현금 베팅, 상금은 제공하지 않습니다.`,
  },
  {
    locale: "es",
    label: "Español",
    apple: "es-ES",
    google: "es-ES",
    voice: "es-ES-ElviraNeural",
    subtitle: "Practica y revisa tus manos",
    short:
      "Practica Hold’em sin conexión, revisa tus manos y prueba otras decisiones.",
    promo:
      "Cada mano, una nueva oportunidad para aprender. Practica sin conexión, entiende tus decisiones y vuelve a jugar el mismo reparto con otro enfoque.",
    keywords:
      "póquer,holdem,texas,sin conexión,práctica,estrategia,manos,probabilidades,outs",
    head: [
      "Aprende jugando.\nMano a mano.",
      "Cada acción,\nal momento.",
      "Revisa la mano.\nEntiende el porqué.",
      "Las mismas cartas.\nOtra decisión.",
      "Tus manos,\nsiempre a mano.",
      "Probabilidades\ny outs, a la vista.",
    ],
    lead: [
      "Empieza con el tutorial.\nDespués, decide por tu cuenta.",
      "Consulta las acciones de la mano\nmientras se desarrolla la partida.",
      "Al terminar, abre la revisión.\nAnaliza la información que tenías.",
      "Pulsa para volver a jugar la mano.\nMismas cartas, una decisión distinta.",
      "Menú → Historial → Detalle de la mano.\nVuelve a los momentos importantes.",
      "56,06 % de victoria · 16 outs\nDescubre qué cartas te ponen por delante.",
    ],
    say: [
      "Aprende las reglas, paso a paso.",
      "Sigue cada acción mientras se juega la mano.",
      "Abre la revisión y entiende tus decisiones.",
      "Repite el reparto y prueba otra decisión.",
      "Consulta el historial y revisa cualquier mano.",
      "Mira tus probabilidades de victoria y tus outs.",
    ],
    cards: [
      [
        "Cada mano,\nuna decisión mejor.",
        "Practica Hold’em sin conexión y a tu ritmo.",
      ],
      ["Aprende\njugando.", "Manos guiadas para pasar de la teoría a la mesa."],
      [
        "Entiende el porqué\nde cada jugada.",
        "Revisa tus decisiones con la información de entonces.",
      ],
      [
        "El mismo reparto.\nOtro camino.",
        "Recupera las cartas y las fichas iniciales.",
      ],
      [
        "Pon las probabilidades\nsobre la mesa.",
        "Consulta victoria, empate y outs.",
      ],
      [
        "Cambia de rival.\nAmplía tu juego.",
        "Ocho estilos y tres niveles de dificultad.",
      ],
      [
        "Tus manos,\nguardadas para ti.",
        "Consulta el historial almacenado en tu dispositivo.",
      ],
      [
        "Vuelve a la mano.\nRepasa cada paso.",
        "Revisa la mesa, el resultado y las acciones.",
      ],
    ],
    feature: "Cada mano,\nuna decisión mejor.",
    tag: "Practica Hold’em sin conexión",
    footer: "PRÁCTICA SIN CONEXIÓN · FICHAS VIRTUALES",
    ribbon: "PRACTICA CON INTENCIÓN",
    description: `Cada mano es una oportunidad para entender tu próxima decisión.

NOIR Poker es una app para practicar Texas Hold’em sin límite y sin conexión. Juega contra rivales controlados por el ordenador, aprende con un tutorial interactivo y vuelve a las jugadas que te hicieron pensar. No necesitas crear una cuenta.

Aprende en la mesa
El tutorial presenta las cartas propias, la posición, las ciegas, las rondas de apuestas, las subidas, las retiradas, el all-in y los botes secundarios. Después de la parte guiada, jugarás una mano por tu cuenta.

Practica a tu ritmo
Elige mesas de 5 a 9 jugadores, tres niveles de dificultad y ocho estilos de rival. Practica el tamaño de tus apuestas, observa las acciones públicas y adáptate a cada oponente. Durante la partida puedes consultar pistas y la clasificación de las manos.

Entiende tus decisiones
La revisión analiza tus jugadas y las de tus rivales con la información disponible antes de cada decisión, el coste de seguir y los rangos supuestos del oponente. Ofrece orientación basada en reglas heurísticas y estimaciones por simulación.

Mismo reparto, otro enfoque
Vuelve a jugar una mano con las cartas originales, el mismo orden del mazo y las fichas iniciales. Prueba otra línea de juego y compara cómo se desarrolla.

Probabilidades e historial, en tu dispositivo
Introduce cartas propias y comunitarias para consultar las probabilidades de victoria, empate y los outs. Las partidas se guardan localmente para que puedas volver a la mesa, al resultado y a cada acción.

Solo se usan fichas virtuales sin valor monetario. No se pueden comprar ni canjear, y no hay apuestas de dinero real ni premios.`,
  },
  {
    locale: "it",
    label: "Italiano",
    apple: "it",
    google: "it-IT",
    voice: "it-IT-ElsaNeural",
    subtitle: "Allenati e rivedi le tue mani",
    short:
      "Allenati al Texas Hold’em offline, rivedi le mani e riprova con scelte diverse.",
    promo:
      "Ogni mano è un’occasione per imparare. Allenati offline, scopri il ragionamento dietro le scelte e rigioca le stesse carte con un approccio diverso.",
    keywords:
      "poker,holdem,texas,offline,allenamento,strategia,mani,probabilità,outs",
    head: [
      "Impara giocando.\nUna mano alla volta.",
      "Ogni azione,\nin tempo reale.",
      "Rivedi la mano.\nCapisci il perché.",
      "Stesse carte.\nUna scelta diversa.",
      "Le tue mani,\nda rivedere.",
      "Probabilità e outs,\nben in vista.",
    ],
    lead: [
      "Segui il tutorial.\nPoi prendi le tue decisioni.",
      "Segui lo storico delle azioni\nmentre la mano si sviluppa.",
      "A fine mano, apri l’analisi.\nRagiona con le informazioni di allora.",
      "Tocca per rigiocare la mano.\nStesse carte, una decisione diversa.",
      "Menu → Storico → Dettagli della mano.\nRitrova i passaggi che contano.",
      "56,06% di vittoria · 16 outs\nScopri quali carte ti portano in vantaggio.",
    ],
    say: [
      "Impara le regole con il tutorial.",
      "Segui ogni azione mentre la mano si sviluppa.",
      "Apri l’analisi e capisci le tue decisioni.",
      "Rigioca le stesse carte e cambia scelta.",
      "Apri lo storico e ripercorri ogni mano.",
      "Controlla la probabilità di vittoria e gli outs.",
    ],
    cards: [
      [
        "Una mano alla volta.\nUna scelta migliore.",
        "Allenati al Texas Hold’em offline, al tuo ritmo.",
      ],
      ["Impara\ngiocando.", "Dalle mani guidate alle decisioni al tavolo."],
      [
        "Scopri il ragionamento\ndietro ogni scelta.",
        "Analizza le decisioni nel contesto di allora.",
      ],
      [
        "Stesse carte.\nUn’altra possibilità.",
        "Riparti dal mazzo e dalle fiches originali.",
      ],
      [
        "Dai un volto\nalle probabilità.",
        "Vittoria, pareggio e outs in un solo posto.",
      ],
      [
        "Cambia avversario.\nCambia prospettiva.",
        "Otto stili e tre livelli di difficoltà.",
      ],
      [
        "Ogni mano,\nconservata per te.",
        "Sfoglia le partite salvate sul dispositivo.",
      ],
      [
        "Torna a quella mano.\nRivedi ogni passaggio.",
        "Tavolo, risultato e azioni, tutti da rivedere.",
      ],
    ],
    feature: "Una mano alla volta.\nUna scelta migliore.",
    tag: "Allenati al Texas Hold’em offline",
    footer: "ALLENAMENTO OFFLINE · FICHES VIRTUALI",
    ribbon: "DAI UN SENSO A OGNI MANO",
    description: `Ogni mano è un’occasione per capire meglio la prossima scelta.

NOIR Poker è un’app per allenarti al Texas Hold’em no-limit offline. Affronta avversari controllati dal computer, impara con un tutorial interattivo e torna sui momenti che meritano una seconda occhiata. Non serve un account.

Impara al tavolo
Il tutorial ti accompagna tra carte private, posizione, bui, giri di puntate, rilanci, fold, all-in e piatti secondari. Dopo la parte guidata, giocherai una mano in autonomia.

Scegli il tuo ritmo
Puoi scegliere tavoli da 5 a 9 giocatori, tre livelli di difficoltà e otto stili di gioco degli avversari. Allenati a dosare le puntate, leggere le azioni visibili e adattarti a chi hai davanti. Durante il gioco puoi consultare suggerimenti e combinazioni.

Rivedi il ragionamento
L’analisi esamina le tue scelte e quelle degli avversari considerando le informazioni disponibili prima di ciascuna azione, il costo del call e i range ipotizzati. I consigli si basano su euristiche e stime ottenute tramite simulazione.

Stesse carte, nuove possibilità
Rigiocando una mano ritrovi le carte private, l’ordine del mazzo e le fiches iniziali. Prova un’altra linea e confronta lo sviluppo della mano.

Probabilità e storico a portata di mano
Imposta carte private e comuni per vedere le probabilità di vittoria, pareggio e gli outs. Le partite restano salvate sul dispositivo, con tavolo, risultato e sequenza delle azioni.

Si usano esclusivamente fiches virtuali senza valore in denaro. Non sono acquistabili né convertibili e non sono previste puntate in denaro reale né premi.`,
  },
  {
    locale: "pt",
    label: "Português (Brasil)",
    apple: "pt-BR",
    google: "pt-BR",
    voice: "pt-BR-FranciscaNeural",
    subtitle: "Pratique e reveja suas mãos",
    short:
      "Pratique Hold’em offline, reveja suas mãos e teste outras decisões.",
    promo:
      "Cada mão traz uma nova chance de aprender. Pratique offline, entenda suas decisões e jogue as mesmas cartas de novo para explorar outra linha.",
    keywords: "poker,holdem,texas,offline,treino,estratégia,mãos,chances,outs",
    head: [
      "Aprenda jogando.\nUma mão de cada vez.",
      "Cada ação,\nem tempo real.",
      "Reveja a mão.\nEntenda o motivo.",
      "As mesmas cartas.\nUma nova escolha.",
      "Suas mãos,\nsempre por perto.",
      "Chances e outs,\nbem à vista.",
    ],
    lead: [
      "Comece pelo tutorial.\nDepois, faça suas próprias escolhas.",
      "Acompanhe o histórico de ações\nenquanto a mão acontece.",
      "Ao terminar, abra a análise.\nConsidere o que você sabia na hora.",
      "Toque para jogar a mão de novo.\nMesmas cartas, outra decisão.",
      "Menu → Histórico → Detalhes da mão.\nVolte aos momentos importantes.",
      "56,06% de vitória · 16 outs\nVeja quais cartas colocam você à frente.",
    ],
    say: [
      "Aprenda as regras, passo a passo.",
      "Acompanhe cada ação em tempo real.",
      "Abra a análise e entenda suas decisões.",
      "Jogue as mesmas cartas e teste outra escolha.",
      "Abra o histórico e reveja cada mão.",
      "Confira suas chances de vitória e seus outs.",
    ],
    cards: [
      [
        "Uma mão por vez.\nDecisões melhores.",
        "Pratique Hold’em offline, no seu ritmo.",
      ],
      ["Aprenda\njogando.", "Mãos guiadas para levar o aprendizado à mesa."],
      [
        "Entenda o motivo\nde cada jogada.",
        "Reveja as decisões com as informações da hora.",
      ],
      [
        "As mesmas cartas.\nOutro caminho.",
        "Recupere as cartas e as fichas iniciais.",
      ],
      ["Deixe as chances\nmais claras.", "Consulte vitória, empate e outs."],
      [
        "Mude de adversário.\nAmplie seu jogo.",
        "Oito estilos e três níveis de dificuldade.",
      ],
      [
        "Suas mãos,\nguardadas com você.",
        "Consulte as partidas salvas no dispositivo.",
      ],
      [
        "Volte àquela mão.\nReveja cada passo.",
        "Mesa, resultado e sequência de ações.",
      ],
    ],
    feature: "Uma mão por vez.\nDecisões melhores.",
    tag: "Treine Hold’em offline",
    footer: "TREINO OFFLINE · FICHAS VIRTUAIS",
    ribbon: "DÊ SENTIDO A CADA TREINO",
    description: `Cada mão é uma chance de entender melhor sua próxima decisão.

NOIR Poker é um app para praticar Texas Hold’em no-limit offline. Jogue contra adversários controlados pelo computador, aprenda com um tutorial interativo e volte aos momentos que merecem atenção. Não é preciso criar uma conta.

Aprenda na mesa
O tutorial apresenta cartas da mão, posição, blinds, rodadas de apostas, raises, folds, all-ins e potes paralelos. Depois da parte guiada, você joga uma mão por conta própria.

Pratique no seu ritmo
Escolha mesas de 5 a 9 jogadores, três níveis de dificuldade e oito estilos de adversário. Treine o tamanho das apostas, acompanhe as ações públicas e adapte suas decisões a quem está na mesa. Dicas e ranking de mãos ficam disponíveis durante o jogo.

Entenda o raciocínio
A análise considera as informações disponíveis antes de cada decisão, o custo para continuar e os ranges estimados dos adversários. As orientações usam heurísticas e estimativas de simulação como apoio ao treino.

Mesmas cartas, outra linha
Ao jogar uma mão de novo, você recupera as cartas originais, a ordem do baralho e as fichas iniciais. Teste outra escolha e compare como a mão se desenvolve.

Chances e histórico sempre à mão
Defina as cartas dos jogadores e da mesa para conferir as chances de vitória, empate e os outs. As partidas ficam salvas no dispositivo, com mesa, resultado e sequência das ações.

O app usa apenas fichas virtuais, sem valor em dinheiro. Elas não podem ser compradas nem trocadas. Não há apostas com dinheiro real ou prêmios.`,
  },
  {
    locale: "de",
    label: "Deutsch",
    apple: "de-DE",
    google: "de-DE",
    voice: "de-DE-KatjaNeural",
    subtitle: "Offline üben, Hände verstehen",
    short:
      "Hold’em offline üben, Hände analysieren und andere Entscheidungen ausprobieren.",
    promo:
      "Jede Hand bringt dich weiter. Übe offline, verstehe deine Entscheidungen und spiele dieselben Karten noch einmal mit einem anderen Ansatz.",
    keywords:
      "poker,holdem,texas,offline,training,strategie,handanalyse,chancen,outs",
    head: [
      "Am Tisch lernen.\nHand für Hand.",
      "Jede Aktion.\nDirekt im Blick.",
      "Hand analysieren.\nGründe verstehen.",
      "Gleiche Karten.\nNeue Entscheidung.",
      "Deine Hände.\nJederzeit wieder ansehen.",
      "Gewinnchancen\nund Outs im Blick.",
    ],
    lead: [
      "Starte mit dem Tutorial.\nDann entscheide selbst.",
      "Verfolge die Aktionen der Hand\nwährend des laufenden Spiels.",
      "Öffne nach der Hand die Analyse.\nEntscheidend ist das damalige Wissen.",
      "Starte dieselbe Hand erneut.\nGleiche Karten, eine andere Entscheidung.",
      "Menü → Spielverlauf → Handdetails.\nSieh dir wichtige Momente erneut an.",
      "56,06 % Gewinnchance · 16 Outs\nWelche Karten bringen dich nach vorn?",
    ],
    say: [
      "Lerne die Regeln – Schritt für Schritt.",
      "Verfolge jede Aktion direkt während der Hand.",
      "Öffne die Analyse und verstehe deine Entscheidungen.",
      "Spiele dieselben Karten und entscheide dich anders.",
      "Sieh dir deine Hände im Spielverlauf nochmal an.",
      "Prüfe deine Gewinnchancen und deine Outs.",
    ],
    cards: [
      [
        "Hand für Hand\nbesser entscheiden.",
        "Hold’em offline und im eigenen Tempo üben.",
      ],
      ["Am Tisch\ndazulernen.", "Geführte Hände machen die Regeln greifbar."],
      [
        "Verstehe die Gründe\nhinter deinem Spiel.",
        "Bewerte Entscheidungen im damaligen Kontext.",
      ],
      [
        "Gleiche Karten.\nEine andere Lösung.",
        "Zurück zur ursprünglichen Kartenfolge und den Startchips.",
      ],
      [
        "Mach Chancen\nsichtbar.",
        "Gewinnchance, Teilungschance und Outs prüfen.",
      ],
      [
        "Andere Gegner.\nNeue Denkanstöße.",
        "Acht Spielstile und drei Schwierigkeitsstufen.",
      ],
      [
        "Jede Hand\nbleibt gespeichert.",
        "Lokal gespeicherte Partien im Verlauf ansehen.",
      ],
      [
        "Zurück zur Hand.\nSchritt für Schritt.",
        "Tisch, Ergebnis und Aktionen erneut ansehen.",
      ],
    ],
    feature: "Hand für Hand\nbesser entscheiden.",
    tag: "Hold’em offline trainieren",
    footer: "OFFLINE-TRAINING · VIRTUELLE CHIPS",
    ribbon: "JEDE HAND BEWUSST SPIELEN",
    description: `Jede Hand ist eine Gelegenheit, die nächste Entscheidung besser zu verstehen.

NOIR Poker ist eine App zum Offline-Training von No-Limit Texas Hold’em. Spiele gegen computergesteuerte Gegner, lerne mit dem interaktiven Tutorial und sieh dir wichtige Situationen noch einmal an. Du brauchst kein Konto.

Am Tisch lernen
Das Tutorial führt dich durch Hole Cards, Position, Blinds, Setzrunden, Raises, Folds, All-ins und Side Pots. Nach der Anleitung spielst du eine Hand selbstständig.

Im eigenen Tempo üben
Wähle Tische mit 5 bis 9 Spielern, drei Schwierigkeitsstufen und acht Gegnerstile. Trainiere deine Einsatzhöhen, beobachte die sichtbaren Aktionen und passe dich verschiedenen Gegnern an. Hinweise und eine Übersicht der Pokerhände sind während des Spiels verfügbar.

Entscheidungen nachvollziehen
Die Analyse betrachtet deine Aktionen und die deiner Gegner anhand der zuvor verfügbaren Informationen, der Kosten eines Calls und angenommener gegnerischer Ranges. Die Hinweise beruhen auf Heuristiken und Simulationsschätzungen und dienen als Trainingshilfe.

Dieselbe Hand anders spielen
Beim erneuten Spielen werden die ursprünglichen Hole Cards, die Kartenreihenfolge und die Startchips wiederhergestellt. Probiere eine andere Linie aus und vergleiche den Verlauf.

Chancen und Spielverlauf griffbereit
Lege Karten und Board fest, um Gewinnchancen, Teilungschancen und Outs zu prüfen. Partien werden lokal gespeichert. So kannst du Tisch, Ergebnis und Aktionsfolge später erneut ansehen.

Gespielt wird ausschließlich mit virtuellen Chips ohne Geldwert. Chips können weder gekauft noch ausgezahlt werden. Es gibt keine Echtgeld-Einsätze oder Geldpreise.`,
  },
  {
    locale: "fr",
    label: "Français",
    apple: "fr-FR",
    google: "fr-FR",
    voice: "fr-FR-DeniseNeural",
    subtitle: "Entraînez-vous au Hold’em",
    short:
      "Pratiquez le Hold’em hors ligne, revoyez vos mains et testez d’autres choix.",
    promo:
      "Chaque main fait progresser votre réflexion. Jouez hors ligne, comprenez vos décisions et rejouez la même donne pour explorer une autre ligne.",
    keywords:
      "poker,holdem,texas,hors ligne,entraînement,stratégie,mains,probabilités,outs",
    head: [
      "Apprenez à table.\nMain après main.",
      "Chaque action,\nen temps réel.",
      "Revoyez la main.\nComprenez vos choix.",
      "Les mêmes cartes.\nUn autre choix.",
      "Vos mains,\nà revoir à volonté.",
      "Vos chances et vos outs,\nd’un coup d’œil.",
    ],
    lead: [
      "Suivez le tutoriel.\nPuis prenez vos propres décisions.",
      "Suivez les actions de la main\npendant qu’elle se déroule.",
      "À la fin, ouvrez l’analyse.\nRevenez sur les informations disponibles.",
      "Rejouez la même main.\nMêmes cartes, autre décision.",
      "Menu → Historique → Détails de la main.\nRetrouvez les moments importants.",
      "56,06 % de victoire · 16 outs\nRepérez les cartes qui vous font passer devant.",
    ],
    say: [
      "Apprenez les règles, pas à pas.",
      "Suivez chaque action en temps réel.",
      "Ouvrez l’analyse pour comprendre vos décisions.",
      "Rejouez les mêmes cartes avec un autre choix.",
      "Retrouvez chaque main dans votre historique.",
      "Consultez vos chances de victoire et vos outs.",
    ],
    cards: [
      [
        "Une main à la fois.\nDes choix plus éclairés.",
        "Entraînez-vous au Hold’em hors ligne, à votre rythme.",
      ],
      ["Apprenez\nen jouant.", "Des mains guidées pour passer à la pratique."],
      [
        "Comprenez le sens\nde chaque décision.",
        "Analysez vos choix avec les informations de l’instant.",
      ],
      [
        "La même donne.\nUne autre possibilité.",
        "Retrouvez les cartes et les jetons de départ.",
      ],
      [
        "Des probabilités\nplus concrètes.",
        "Consultez victoire, partage du pot et outs.",
      ],
      [
        "Changez d’adversaire.\nChangez de perspective.",
        "Huit styles et trois niveaux de difficulté.",
      ],
      [
        "Vos mains,\nconservées pour vous.",
        "Parcourez les parties enregistrées sur votre appareil.",
      ],
      [
        "Revenez à cette main.\nRevoyez chaque étape.",
        "Retrouvez la table, le résultat et les actions.",
      ],
    ],
    feature: "Une main à la fois.\nDes choix plus éclairés.",
    tag: "Entraînez-vous au Hold’em hors ligne",
    footer: "ENTRAÎNEMENT HORS LIGNE · JETONS VIRTUELS",
    ribbon: "DONNEZ DU SENS À CHAQUE MAIN",
    description: `Chaque main est une occasion de mieux comprendre votre prochaine décision.

NOIR Poker est une application pour s’entraîner au Texas Hold’em no-limit hors ligne. Affrontez des adversaires contrôlés par l’ordinateur, apprenez avec le tutoriel interactif et revenez sur les moments clés. Aucun compte n’est nécessaire.

Apprenez à table
Le tutoriel vous fait découvrir les cartes privatives, la position, les blindes, les tours d’enchères, les relances, le fold, les tapis et les pots annexes. Après la partie guidée, vous jouez une main en autonomie.

Avancez à votre rythme
Choisissez des tables de 5 à 9 joueurs, trois niveaux de difficulté et huit styles d’adversaires. Travaillez le montant de vos mises, observez les actions visibles et adaptez-vous à vos adversaires. Des conseils et un rappel des combinaisons restent accessibles pendant le jeu.

Comprenez les décisions
L’analyse revient sur vos actions et celles de vos adversaires à partir des informations disponibles avant chaque choix, du coût à payer et de ranges adverses supposées. Les conseils reposent sur des heuristiques et des estimations par simulation.

Même donne, autre approche
Rejouer une main rétablit les cartes privatives, l’ordre du paquet et les jetons de départ. Essayez une autre ligne et comparez le déroulement de la main.

Probabilités et historique à portée de main
Définissez les cartes et le board pour consulter les chances de victoire, de partage du pot et les outs. Les parties sont conservées sur votre appareil pour revoir la table, le résultat et les actions.

Seuls des jetons virtuels sans valeur monétaire sont utilisés. Ils ne peuvent être ni achetés ni convertis en argent. Il n’y a ni mise d’argent réel ni prix à gagner.`,
  },
  {
    locale: "ru",
    label: "Русский",
    apple: "ru",
    google: "ru-RU",
    voice: "ru-RU-SvetlanaNeural",
    subtitle: "Тренировки и разбор раздач",
    short:
      "Холдем офлайн: тренируйтесь, разбирайте раздачи и пробуйте другие решения.",
    promo:
      "Каждая раздача — повод лучше понять свою игру. Тренируйтесь офлайн, разбирайте решения и переигрывайте те же карты, выбирая другую линию.",
    keywords: "покер,холдем,офлайн,тренировка,стратегия,раздачи,ауты",
    head: [
      "Учитесь за столом.\nРаздача за раздачей.",
      "Каждое действие —\nперед глазами.",
      "Откройте разбор.\nПоймите решение.",
      "Те же карты.\nДругой выбор.",
      "Ваши раздачи —\nвсегда под рукой.",
      "Шансы на победу\nи ауты — наглядно.",
    ],
    lead: [
      "От раздач с подсказками\nк самостоятельной игре.",
      "Следите за действиями игроков\nпо ходу текущей раздачи.",
      "После раздачи откройте разбор.\nУчитывайте информацию на тот момент.",
      "Переиграйте ту же раздачу.\nТе же карты, другое решение.",
      "Меню → История → Детали раздачи.\nВернитесь к важным моментам.",
      "Шанс на победу 56,06% · 16 аутов\nПосмотрите, какие карты выведут вас вперёд.",
    ],
    say: [
      "Изучайте правила в раздачах с подсказками.",
      "Следите за действиями по ходу раздачи.",
      "Откройте разбор и поймите свои решения.",
      "Переиграйте те же карты и попробуйте другой ход.",
      "Откройте историю и вернитесь к любой раздаче.",
      "Проверьте свои шансы на победу и ауты.",
    ],
    cards: [
      [
        "Раздача за раздачей —\nк взвешенным решениям.",
        "Тренируйтесь в холдеме офлайн, в своём темпе.",
      ],
      [
        "Учитесь\nза игровым столом.",
        "Раздачи с подсказками помогут освоить основы.",
      ],
      [
        "Поймите логику\nсвоих действий.",
        "Разбирайте решения с учётом доступной тогда информации.",
      ],
      [
        "Те же карты.\nДругая возможность.",
        "Верните исходные карты, порядок колоды и фишки.",
      ],
      ["Оцените шансы\nнаглядно.", "Вероятности победы, дележа банка и ауты."],
      [
        "Другие соперники.\nНовый взгляд на игру.",
        "Восемь стилей и три уровня сложности.",
      ],
      [
        "Каждая раздача\nостаётся в истории.",
        "Просматривайте партии, сохранённые на устройстве.",
      ],
      [
        "Вернитесь к раздаче.\nВспомните каждый ход.",
        "Стол, результат и последовательность действий.",
      ],
    ],
    feature: "Раздача за раздачей —\nк взвешенным решениям.",
    tag: "Тренировка холдема офлайн",
    footer: "ОФЛАЙН-ТРЕНИРОВКА · ВИРТУАЛЬНЫЕ ФИШКИ",
    ribbon: "ИГРАЙТЕ ОСМЫСЛЕННО",
    description: `Каждая раздача помогает лучше понять следующее решение.

NOIR Poker — приложение для офлайн-тренировки безлимитного техасского холдема. Играйте против компьютерных соперников, осваивайте основы в раздачах с подсказками и возвращайтесь к важным моментам. Регистрация не нужна.

Учитесь за столом
Обучение знакомит с карманными картами, позицией, блайндами, кругами торговли, рейзом, фолдом, олл-ином и побочными банками. После раздач с подсказками вы сыграете одну самостоятельно.

Тренируйтесь в своём темпе
Доступны столы на 5–9 игроков, три уровня сложности и восемь стилей соперников. Отрабатывайте размеры ставок, следите за открытыми действиями и подстраивайтесь под разных оппонентов. Во время игры можно посмотреть подсказки и комбинации.

Разбирайте ход мысли
Разбор учитывает информацию, доступную до каждого действия, стоимость продолжения и предполагаемые диапазоны соперников. Рекомендации основаны на эвристиках и оценках симуляции и служат ориентиром для тренировки.

Те же карты — другое решение
Повтор раздачи восстанавливает исходные карманные карты, порядок колоды и стартовые фишки. Попробуйте другую линию и сравните ход игры.

Шансы и история под рукой
Укажите карты игроков и борда, чтобы посмотреть вероятность победы, дележа банка и ауты. Партии сохраняются на устройстве: к столу, результату и последовательности действий можно вернуться позже.

Используются только виртуальные фишки без денежной стоимости. Их нельзя купить или обменять на деньги. Ставок на реальные деньги и денежных призов нет.`,
  },
];
const en = old["en-US"],
  zh = old["zh-Hans"];
const films = {
  en: {
    head: [
      "Learn at\nthe table.",
      "Every action.\nAs it happens.",
      "Tap Review.\nFind the reason.",
      "Same deal.\nA new decision.",
      "Your hands.\nWorth revisiting.",
      "Win rate.\nAnd your outs.",
    ],
    lead: [
      "Guided hands.\nLearn by making real choices.",
      "Play your hand.\nFollow its live action history.",
      "Finish the hand. Tap Review.\nConnect choices with their reasons.",
      "Tap Replay hand.\nSame cards. A different decision.",
      "Menu → Game records → Hand details.\nReturn to the moments that matter.",
      "Win rate 56.06% · 16 outs\nSee which cards can take the lead.",
    ],
    say: [
      "Learn the rules, one guided hand at a time.",
      "Follow every action as the hand unfolds.",
      "Finish a hand. Tap Review. Understand the decision.",
      "Replay the same deal. Try a different decision.",
      "Open your game records. Revisit every hand.",
      "See your win rate and count your outs.",
    ],
    cards: [
      ["A table for\nyour next decision.", "Offline Hold’em. Your pace."],
      ["Learn at\nthe table.", "Guided hands. Real choices."],
      ["See the reason\nbehind the play.", "Review decisions in context."],
      [
        "Same deal.\nAnother possibility.",
        "Replay the original cards and stacks.",
      ],
      ["Make the\nodds visible.", "Win, tie and outs in one place."],
      [
        "Meet a different\nkind of opponent.",
        "Eight styles. Three difficulty levels.",
      ],
      ["Every hand,\nkept close.", "Browse locally saved game records."],
      [
        "Return to\nthe whole hand.",
        "Revisit the table, result and action history.",
      ],
    ],
    feature: "Your next decision\nstarts here.",
    tag: "Offline Hold’em practice",
    footer: "OFFLINE PRACTICE · VIRTUAL CHIPS",
    ribbon: "PRACTICE WITH PURPOSE",
  },
  "zh-CN": {
    head: [
      "跟着实战，\n学会规则。",
      "每步行动，\n实时看清。",
      "点开复盘，\n看懂理由。",
      "重打原牌，\n换种决策。",
      "对局记录，\n随时回看。",
      "胜率与 Outs，\n一眼看清。",
    ],
    lead: [
      "从互动引导\n到自己完成一手牌",
      "正常对局，随时下滑\n查看本手动态实时更新",
      "一手结束，点击复盘\n连接当时信息与行动理由",
      "结算后点击“重打本手”\n用原牌尝试另一种选择",
      "打开菜单里的对局记录\n再进入这一手的记录详情",
      "胜率 56.06% · Outs 16\n看清哪些补牌能让这手牌领先",
    ],
    say: [
      "跟着互动引导，轻松学会规则。",
      "每一步行动，本手动态实时记录。",
      "打完一手，点开复盘，理解决策。",
      "重新打同一副牌，换一种决策。",
      "打开对局记录，随时回看每手详情。",
      "看清胜率，也看哪些牌能反超。",
    ],
    cards: [
      ["每一手，\n练习更好的判断。", "离线德州扑克，按自己的节奏开练"],
      ["跟着实战，\n学会规则。", "从互动引导，到独立完成一手牌"],
      ["看懂每次\n行动的理由。", "结合当时的信息，理解选择与代价"],
      ["同一副牌，\n再试一种选择。", "恢复原始底牌、发牌顺序与起始筹码"],
      ["看清胜率，\n让判断更有依据。", "获胜、平局与 Outs，清楚呈现"],
      ["换一种对手，\n打开新的思路。", "八种训练风格，三个难度级别"],
      ["练过的每手牌，\n都值得再看。", "按对局浏览本机保存的牌局记录"],
      ["回到当时，\n看清完整过程。", "回看牌桌、结算与每一步行动"],
    ],
    feature: "每一手，\n练习更好的判断。",
    tag: "离线德州扑克练习",
    footer: "离线练习 · 虚拟筹码",
    ribbon: "让每次练习都有收获",
  },
};
const basics = [
  {
    locale: "zh-CN",
    label: "简体中文",
    apple: "zh-Hans",
    google: "zh-CN",
    voice: "zh-CN-XiaoxiaoNeural",
    ...films["zh-CN"],
    subtitle: zh.apple.subtitle,
    short: zh.google.shortDescription,
    promo: zh.apple.promotionalText,
    keywords: zh.apple.keywords,
    description: zh.apple.description,
  },
  {
    locale: "en",
    label: "English",
    apple: "en-US",
    google: "en-US",
    voice: "en-US-EmmaNeural",
    ...films.en,
    subtitle: en.apple.subtitle,
    short: en.google.shortDescription,
    promo: en.apple.promotionalText,
    keywords: en.apple.keywords,
    description: en.apple.description,
  },
];
export const catalog = Object.fromEntries(
  [...basics, ...items].map((x) => [x.locale, { ...x, appName: "NOIR Poker" }]),
);
if (process.argv[1]?.endsWith("catalog.mjs"))
  fs.writeFileSync(
    new URL("catalog.json", import.meta.url),
    JSON.stringify(catalog, null, 2) + "\n",
  );
