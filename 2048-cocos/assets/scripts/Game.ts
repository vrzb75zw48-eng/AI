import {
  _decorator, Node, Component, Label, Sprite, SpriteFrame, UITransform,
  Texture2D, ImageAsset, Color, EventTouch, Vec3, v3, Button, tween, resources,
  EditBox, AudioClip, AudioSource, VideoPlayer, sys
} from 'cc';

const { ccclass } = _decorator;
const UILAYER = 1 << 25; // UI_2D layer，必须与相机 visibility 匹配，否则黑屏

const DIFF: Record<string, number> = { easy: 5, normal: 4, hard: 3 };
const DIFF_LABEL: Record<string, string> = { easy: '5 × 5', normal: '4 × 4', hard: '3 × 3' };
const TILE_IMG = ['tile1', 'tile2', 'tile3', 'tile4', 'tile5', 'tile6', 'tile7', 'tile8'];

const C = {
  bg: hex(0xfaf8ef), board: hex(0xbbada0), cell: new Color(238, 228, 218, 90),
  text: hex(0x776e65), btn: hex(0x8f7a66), white: new Color(249, 246, 242, 255),
  tile: [hex(0xeee4da), hex(0xede0c8), hex(0xf2b179), hex(0xf59563), hex(0xf67c5f),
    hex(0xf65e3b), hex(0xedcf72), hex(0xedcc61), hex(0xedc850), hex(0xedc53f), hex(0xedc22e), hex(0x3c3a32)],
  neon: hex(0x00f0ff), neonDim: new Color(0, 240, 255, 140), green: hex(0x00ff41), gold: hex(0xf3d774),
};
function hex(v: number) { return new Color((v >> 16) & 255, (v >> 8) & 255, v & 255, 255); }
function tileColor(value: number): Color {
  if (value >= 2048) return C.tile[11];
  return C.tile[Math.min(Math.max(0, Math.floor(Math.log2(value)) - 1), 11)];
}

const SUPA_URL = 'https://uyatewhlxqjgfeohrxjh.supabase.co';
const SUPA_KEY = 'sb_publishable_JI3_m7J9Pe4XLDb87GQzig_XGK_PGiR';
const SUPA_H: Record<string, string> = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Accept-Profile': 'public', 'Content-Profile': 'public' };

interface Tile { node: Node; r: number; c: number; value: number; merged?: boolean; }

let _whiteSF: SpriteFrame | null = null;
function whiteSpriteFrame(): SpriteFrame {
  if (_whiteSF) return _whiteSF;
  const img = new ImageAsset(new Uint8Array([255, 255, 255, 255]));
  const tex = new Texture2D(); tex.image = img;
  const sf = new SpriteFrame(); sf.texture = tex; _whiteSF = sf; return sf;
}
function L(n: Node): Node { n.layer = UILAYER; return n; }

@ccclass('Game')
export class Game extends Component {
  state: 'login' | 'diff' | 'game' = 'login';
  difficulty = 'normal'; size = 4;
  board: (Tile | null)[][] = [];
  score = 0; best = 0; topTile = 0;
  busy = false; over = false; won = false; keepPlaying = false;
  history: { grid: number[][]; score: number }[] = [];
  nick = ''; scoreSubmitted = false; rankDiff = 'normal'; rankTimer = 0;

  tileFrames: SpriteFrame[] = [];
  loginBgSF: SpriteFrame | null = null;
  loginAudio: AudioClip | null = null;
  mergeAudio: AudioClip | null = null;
  audioSrc: AudioSource | null = null;
  videoPlayer: VideoPlayer | null = null;

  boardRoot: Node | null = null;
  tileRoot: Node | null = null;
  gameUI: Node | null = null;
  loginUI: Node | null = null;
  diffUI: Node | null = null;
  rankUI: Node | null = null;
  rankList: Node | null = null;
  scoreLabel: Label | null = null;
  bestBox: Label | null = null;
  undoBtn: Node | null = null;
  overlayUI: Node | null = null;
  cell = 110; gap = 10;
  touchStart: Vec3 | null = null;

  onLoad() { this.start(); }

  async start() {
    await this.loadAsync();
    this.node.on('touch-start', this.onTouchStart, this);
    this.node.on('touch-end', this.onTouchEnd, this);
    this.buildLogin(); this.buildDiff(); this.buildGame();
    this.setState('login'); this.startAudio();
  }

  async loadAsync() {
    for (const n of TILE_IMG) {
      const sf = await new Promise<SpriteFrame | null>((res) => resources.load('tiles/' + n, SpriteFrame, (e, a) => res(e ? null : a)));
      if (sf) this.tileFrames.push(sf);
    }
    this.loginBgSF = await new Promise((res) => resources.load('textures/login_bg', SpriteFrame, (e, a) => res(e ? null : a)));
    this.loginAudio = await new Promise((res) => resources.load('audio/login_music', AudioClip, (e, a) => res(e ? null : a)));
    this.mergeAudio = await new Promise((res) => resources.load('audio/naiwa_original_short5s', AudioClip, (e, a) => res(e ? null : a)));
  }

  setState(s: 'login' | 'diff' | 'game') {
    this.state = s;
    if (this.loginUI) this.loginUI.active = s === 'login';
    if (this.diffUI) this.diffUI.active = s === 'diff';
    if (this.gameUI) this.gameUI.active = s === 'game';
  }

  // ===== 登录（cyberpunk，竖屏）=====
  buildLogin() {
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = this.cyberPanel('login', W, H); this.loginUI = n;
    this.txt('SYSTEM READY', 13, 0, H * 0.24, C.neonDim, n);
    this.txt('2048', 100, 0, H * 0.14, C.neon, n).getComponent(Label)!.isBold = true;
    this.txt('CYBERPUNK EDITION', 13, 0, H * 0.06, new Color(255, 255, 255, 90), n);

    const eb = L(Node.create('nick')); eb.layer = UILAYER; const et = eb.addComponent(UITransform); et.setContentSize(220, 52);
    const box = eb.addComponent(EditBox);
    box.placeholder = '输入昵称'; box.placeholderLabel = this.mkLbl('输入昵称', 16, C.neonDim);
    box.textLabel = this.mkLbl('', 18, C.neon); box.backgroundSpriteFrame = whiteSpriteFrame(); box.string = this.nick;
    eb.setPosition(0, H * -0.02); n.addChild(eb);
    box.on('editing-did-ended', () => { this.nick = box.string.trim(); try { sys.localStorage.setItem('game2048-nick', this.nick); } catch (e) { } });

    const ln = this.neonBtn('登录', 140, 56, () => this.onLogin()); ln.setPosition(-80, -H * 0.14); n.addChild(ln);
    const rk = this.neonBtn('排行榜', 140, 56, () => this.showRank('login')); rk.setPosition(80, -H * 0.14); n.addChild(rk);
  }
  onLogin() { if (!this.nick) return; this.setState('diff'); }

  // ===== 难度（cyberpunk，竖屏三按钮纵排）=====
  buildDiff() {
    if (this.diffUI) return;
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = this.cyberPanel('diff', W, H); this.diffUI = n;
    this.txt('SELECT DIFFICULTY', 13, 0, H * 0.22, C.neonDim, n);
    this.txt('选择难度', 48, 0, H * 0.14, C.neon, n).getComponent(Label)!.isBold = true;
    const ds = ['easy', 'normal', 'hard'];
    let y = H * 0.02;
    for (let i = 0; i < 3; i++) {
      const b = this.neonBtn(ds[i] === 'easy' ? '简单' : ds[i] === 'normal' ? '普通' : '困难', 220, 72, (d => () => this.onDiff(d))(ds[i]));
      b.setPosition(0, y); n.addChild(b);
      this.txt(DIFF_LABEL[ds[i]], 15, 0, -28, C.neonDim, b);
      y -= 96;
    }
  }
  onDiff(d: string) { this.difficulty = d; this.size = DIFF[d]; this.newGame(); this.setState('game'); }

  // ===== 游戏（经典米黄，竖屏：HUD 顶 + 棋盘居中）=====
  buildGame() {
    if (this.gameUI) return;
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = L(this.rect(W + 400, H + 600, C.bg)); n.setPosition(0, 0, 0); root.addChild(n); this.gameUI = n;

    this.txt('2048', 48, -W * 0.32, H * 0.36, C.text, n).getComponent(Label)!.isBold = true;
    this.txt('滑动方块 · 合并数字', 13, -W * 0.32, H * 0.32, new Color(119, 110, 101, 200), n);
    this.scoreLabel = this.scoreBox(n, '分数', W * 0.20, H * 0.36);
    this.bestBox = this.scoreBox(n, '最佳', W * 0.36, H * 0.36);
    const ng = this.mkBtn('新游戏', () => this.newGame()); ng.setPosition(-W * 0.30, H * 0.29); n.addChild(ng);
    this.undoBtn = this.mkBtn('撤销', () => this.undo()); this.undoBtn.setPosition(-W * 0.10, H * 0.29); n.addChild(this.undoBtn);
    this.buildGrid(n);
  }

  scoreBox(n: Node, cap: string, x: number, y: number): Label {
    const box = L(this.rect(84, 56, C.board)); box.setPosition(x, y, 0); n.addChild(box);
    this.txt(cap, 12, 0, 15, C.white, box);
    const v = this.txt('0', 22, 0, -11, C.white, box);
    return v.getComponent(Label)!;
  }

  buildGrid(n: Node) {
    if (this.boardRoot) this.boardRoot.destroy();
    if (this.tileRoot) this.tileRoot.destroy();
    const W = this.node.getComponent(UITransform)!.contentSize.width;
    const H = this.node.getComponent(UITransform)!.contentSize.height;
    this.cell = Math.min(W / (this.size + 1.4), 120);
    const total = this.size * this.cell + (this.size + 1) * this.gap;
    const board = L(this.rect(total, total, C.board));
    board.setPosition(0, H * 0.0, 0);
    n.addChild(board); this.boardRoot = board;
    this.tileRoot = L(Node.create('tiles')); this.tileRoot.layer = UILAYER; board.addChild(this.tileRoot);
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const cell = L(this.rect(this.cell - this.gap * 0.4, this.cell - this.gap * 0.4, C.cell));
      cell.setPosition(this.px(c), this.py(r), 0); this.boardRoot!.addChild(cell);
    }
  }

  newGame() {
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    this.score = 0; this.topTile = 0; this.over = false; this.won = false; this.keepPlaying = false; this.busy = false; this.history = []; this.scoreSubmitted = false;
    if (this.tileRoot) this.tileRoot.removeAllChildren();
    this.hideOverlay(); this.hideRank();
    if (this.boardRoot) this.boardRoot.destroy();
    this.buildGrid(this.gameUI!);
    this.updateHUD(); this.spawn(true); this.spawn(true);
  }

  spawn(anim = true) {
    const empty: [number, number][] = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (!this.board[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    this.board[r][c] = this.mkTile(r, c, Math.random() < 0.9 ? 2 : 4, anim);
  }

  mkTile(r: number, c: number, value: number, anim: boolean): Tile {
    const node = L(Node.create('tile' + value)); node.layer = UILAYER;
    const tr = node.addComponent(UITransform); tr.setContentSize(this.cell - this.gap, this.cell - this.gap); tr.setAnchorPoint(0.5, 0.5);
    const sp = node.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = whiteSpriteFrame(); sp.color = tileColor(value); sp.layer = UILAYER;
    if (this.tileFrames.length) {
      const tx = L(Node.create('tex')); tx.layer = UILAYER;
      tx.addComponent(UITransform).setContentSize(this.cell - this.gap, this.cell - this.gap);
      const ts = tx.addComponent(Sprite); ts.sizeMode = Sprite.SizeMode.CUSTOM; ts.spriteFrame = this.tileFrames[Math.floor(Math.random() * this.tileFrames.length)]; ts.layer = UILAYER;
      node.addChild(tx);
    }
    const len = String(value).length;
    const fs = this.cell * (len <= 2 ? 0.45 : len === 3 ? 0.36 : len === 4 ? 0.28 : 0.22);
    const lbl = L(Node.create('v')); lbl.layer = UILAYER;
    lbl.addComponent(UITransform).setContentSize(this.cell, this.cell);
    const ll = lbl.addComponent(Label); ll.string = String(value); ll.fontSize = Math.floor(fs); ll.lineHeight = Math.floor(fs * 1.2);
    ll.horizontalAlign = Label.HorizontalAlign.CENTER; ll.verticalAlign = Label.VerticalAlign.CENTER; ll.color = Color.WHITE; ll.isBold = true; ll.enableShadow = true; ll.shadow = new Color(0, 0, 0, 120);
    node.addChild(lbl);
    node.setPosition(this.px(c), this.py(r), 0);
    this.tileRoot!.addChild(node);
    if (anim) { node.setScale(0, 0, 1); tween(node).to(0.12, { scale: v3(1, 1, 1) }).start(); }
    return { node, r, c, value };
  }

  canMove() {
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const t = this.board[r][c]; if (!t) return true;
      if (c + 1 < this.size && this.board[r][c + 1]?.value === t.value) return true;
      if (r + 1 < this.size && this.board[r + 1][c]?.value === t.value) return true;
    }
    return false;
  }

  move(dir: 'up' | 'down' | 'left' | 'right') {
    if (this.busy || this.over) return;
    const V: Record<string, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const v = V[dir];
    const idx = Array.from({ length: this.size }, (_, i) => i);
    const rowOrder = v[0] === 1 ? idx.slice().reverse() : idx;
    const colOrder = v[1] === 1 ? idx.slice().reverse() : idx;
    const snapshot = { grid: this.board.map(row => row.map(t => (t ? t.value : 0))), score: this.score };
    const eaten: Tile[] = []; const merged: Tile[] = []; let moved = false;
    for (const r of rowOrder) for (const c of colOrder) {
      const tile = this.board[r][c]; if (!tile) continue;
      let tr = r, tc = c, target: Tile | null = null;
      for (; ;) {
        const nr = tr + v[0], nc = tc + v[1];
        if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size) break;
        const o = this.board[nr][nc];
        if (!o) { tr = nr; tc = nc; continue; }
        if (o.value === tile.value && !o.merged) { tr = nr; tc = nc; target = o; }
        break;
      }
      if (tr === r && tc === c) continue;
      this.board[r][c] = null;
      if (target) { target.merged = true; target.value *= 2; eaten.push(tile); merged.push(target); }
      else this.board[tr][tc] = tile;
      tile.r = tr; tile.c = tc; moved = true;
    }
    if (!moved) return;
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const t = this.board[r][c]; if (t) t.node.setPosition(this.px(c), this.py(r), 0);
    }
    this.history.push(snapshot); if (this.history.length > 50) this.history.shift();
    this.busy = true;
    this.scheduleOnce(() => this.finishTurn(eaten, merged), 0.13);
  }

  finishTurn(eaten: Tile[], merged: Tile[]) {
    for (const t of eaten) t.node.destroy();
    for (const t of merged) {
      t.merged = false;
      t.node.getChildByPath('v')!.getComponent(Label)!.string = String(t.value);
      t.node.getComponent(Sprite)!.color = tileColor(t.value);
      t.node.setScale(1.1, 1.1, 1); tween(t.node).to(0.1, { scale: v3(1, 1, 1) }).start();
    }
    let gained = 0; for (const t of merged) gained += Math.floor(t.value / 2);
    this.score += gained; this.topTile = Math.max(this.topTile, ...merged.map(t => t.value));
    if (this.score > this.best) { this.best = this.score; this.saveBest(); }
    this.spawn(true); this.updateHUD(); this.busy = false;
    if (merged.length) this.playMerge();
    if (merged.some(t => t.value === 2048) && !this.won && !this.keepPlaying) { this.won = true; this.showOverlay('win'); }
    else if (!this.canMove()) { this.over = true; this.showOverlay('lose'); }
  }

  undo() {
    if (this.busy || !this.history.length) return;
    const snap = this.history.pop()!;
    this.tileRoot!.removeAllChildren();
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const val = snap.grid[r][c]; if (val) this.board[r][c] = this.mkTile(r, c, val, false);
    }
    this.score = snap.score; this.over = false; this.hideOverlay(); this.updateHUD();
  }

  updateHUD() {
    if (this.scoreLabel) this.scoreLabel.string = String(this.score);
    if (this.bestBox) this.bestBox.string = String(this.best);
    if (this.undoBtn) this.undoBtn.getComponent(Button)!.interactable = this.history.length > 0;
  }
  saveBest() { try { sys.localStorage.setItem('game2048-best', String(this.best)); } catch (e) { } }

  // ===== 排行榜 =====
  async fetchRank() {
    if (!this.rankList) return;
    this.rankList.removeAllChildren();
    try {
      const res = await (globalThis as any).fetch(SUPA_URL + '/rest/v1/scores?select=nickname,score,top_tile&difficulty=eq.' + this.rankDiff + '&order=score.desc&limit=10', { headers: SUPA_H });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (!data.length) this.txt('NO SCORES YET', 14, 0, 0, C.neonDim, this.rankList);
      else {
        let y = 0;
        for (let i = 0; i < data.length; i++) {
          const row = L(this.rect(360, 46, new Color(0, 240, 255, 12))); row.setPosition(0, y, 0); this.rankList!.addChild(row);
          this.txt(String(i + 1), 18, -160, 0, C.neon, row);
          this.txt(String(data[i].nickname || 'ANON').replace(/[<>&"']/g, ''), 14, -50, 0, new Color(255, 255, 255, 200), row);
          this.txt(String(data[i].score), 16, 110, 0, C.green, row).getComponent(Label)!.isBold = true;
          this.txt(String(data[i].top_tile || ''), 11, 160, 0, new Color(255, 255, 255, 90), row);
          y -= 54;
        }
      }
    } catch (e) { this.txt('FAILED TO LOAD', 14, 0, 0, hex(0xff0044), this.rankList); }
  }
  showRank(from: string) {
    this.hideRank();
    const root = this.node; const W = root.getComponent(UITransform)!.contentSize.width;
    const H = root.getComponent(UITransform)!.contentSize.height;
    const n = L(this.rect(W + 400, H + 600, new Color(0, 0, 0, 235))); n.setPosition(0, 0, 0); root.addChild(n); this.rankUI = n;
    this.txt('排行榜', 34, 0, H * 0.30, C.neon, n).getComponent(Label)!.isBold = true;
    const txs = [-W * 0.2, 0, W * 0.2]; const ds = ['easy', 'normal', 'hard'];
    for (let i = 0; i < 3; i++) {
      const b = this.neonBtn(ds[i] === 'easy' ? '简单' : ds[i] === 'normal' ? '普通' : '困难', 92, 46, (d => () => { this.rankDiff = d; this.fetchRank(); })(ds[i]));
      b.setPosition(txs[i], H * 0.24); n.addChild(b);
    }
    this.rankList = L(Node.create('list')); this.rankList.layer = UILAYER;
    this.rankList.addComponent(UITransform).setContentSize(380, 400); this.rankList.setPosition(0, H * 0.0); n.addChild(this.rankList);
    const cl = this.neonBtn('关闭', 160, 52, () => this.hideRank()); cl.setPosition(0, -H * 0.34); n.addChild(cl);
    this.rankDiff = this.difficulty; this.fetchRank(); this.startRankTimer();
  }
  hideRank() { if (this.rankUI) { this.rankUI.destroy(); this.rankUI = null; this.rankList = null; } this.stopRankTimer(); }
  startRankTimer() { if (this.rankTimer) return; this.rankTimer = setInterval(() => this.fetchRank(), 3000) as unknown as number; }
  stopRankTimer() { if (this.rankTimer) { clearInterval(this.rankTimer); this.rankTimer = 0; } }

  async submitScore() {
    try {
      const res = await (globalThis as any).fetch(SUPA_URL + '/rest/v1/scores', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, SUPA_H),
        body: JSON.stringify({ nickname: this.nick || 'ANON', score: this.score, top_tile: this.topTile, difficulty: this.difficulty })
      });
      return res.ok;
    } catch (e) { return false; }
  }

  // ===== 结束 overlay =====
  showOverlay(mode: string) {
    this.hideOverlay();
    const boardH = this.boardRoot?.getComponent(UITransform)!.contentSize.height ?? 400;
    const n = L(this.rect(boardH, boardH, new Color(13, 13, 13, 235)));
    if (this.boardRoot) { this.boardRoot.parent!.addChild(n); n.setPosition(this.boardRoot.position); }
    else this.node.addChild(n);
    this.overlayUI = n;
    if (mode === 'lose') {
      const vv = L(Node.create('vid')); vv.layer = UILAYER;
      vv.addComponent(UITransform).setContentSize(boardH, boardH);
      const vp = vv.addComponent(VideoPlayer); vp.resourceType = VideoPlayer.ResourceType.LOCAL; vp.clip = 'video/ending.mp4';
      vp.isFullscreen = false; vp.keepAspectRatio = true; n.addChild(vv); this.videoPlayer = vp;
      try { vp.play(); } catch (e) { }
    }
    const col = mode === 'win' ? C.gold : C.green;
    this.txt(mode === 'win' ? 'YOU WIN' : 'GAME OVER', 40, 0, boardH * 0.30, col, n).getComponent(Label)!.isBold = true;
    this.txt('SCORE', 16, 0, boardH * 0.16, col, n);
    this.txt(String(this.nick ? this.nick + '  ' + this.score : this.score), 32, 0, boardH * 0.08, col, n).getComponent(Label)!.isBold = true;
    if (mode === 'lose' && !this.scoreSubmitted) {
      const st = this.txt('上传中...', 14, 0, boardH * -0.02, C.neonDim, n);
      this.submitScore().then(ok => { this.scoreSubmitted = true; st.getComponent(Label)!.string = ok ? '分数已上传' : '上传失败'; });
    }
    const cy = -boardH * 0.28;
    if (mode === 'win') {
      const k = this.neonBtn('CONTINUE', 130, 48, () => { this.keepPlaying = true; this.hideOverlay(); }); k.setPosition(-80, cy, 0); n.addChild(k);
      const r = this.neonBtn('RESTART', 130, 48, () => this.newGame()); r.setPosition(80, cy, 0); n.addChild(r);
    } else {
      const r = this.neonBtn('RESTART', 130, 48, () => this.newGame()); r.setPosition(-60, cy, 0); n.addChild(r);
      const rk = this.neonBtn('排行榜', 130, 48, () => this.showRank('end')); rk.setPosition(80, cy, 0); n.addChild(rk);
    }
  }
  hideOverlay() { if (this.overlayUI) { try { this.videoPlayer && this.videoPlayer.stop(); } catch (e) { } this.overlayUI.destroy(); this.overlayUI = null; this.videoPlayer = null; } }

  // ===== 音频 =====
  startAudio() {
    if (!this.loginAudio) return;
    const a = L(Node.create('audio')); a.layer = UILAYER; this.node.addChild(a);
    this.audioSrc = a.addComponent(AudioSource); this.audioSrc.volume = 0.5;
    this.audioSrc.clip = this.loginAudio; this.audioSrc.loop = true; this.audioSrc.play();
  }
  playMerge() { if (this.mergeAudio && this.audioSrc) { this.audioSrc.stop(); this.audioSrc.clip = this.mergeAudio; this.audioSrc.playOneShot(this.mergeAudio); this.scheduleOnce(() => { if (this.loginAudio) { this.audioSrc.clip = this.loginAudio; this.audioSrc.loop = true; this.audioSrc.play(); } }, 1.2); } }

  // ===== 触摸 =====
  onTouchStart(e: EventTouch) { this.touchStart = e.touch.getUILocation(); }
  onTouchEnd(e: EventTouch) {
    if (this.state !== 'game' || !this.touchStart) return;
    const p = e.touch.getUILocation();
    const dx = p.x - this.touchStart.x, dy = p.y - this.touchStart.y; this.touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  // ===== 工具 =====
  px(c: number) { const s = this.size * this.cell + (this.size - 1) * this.gap; return -s / 2 + this.gap + c * (this.cell + this.gap) + this.cell / 2; }
  py(r: number) { const s = this.size * this.cell + (this.size - 1) * this.gap; return s / 2 - this.gap - r * (this.cell + this.gap) - this.cell / 2; }

  cyberPanel(name: string, W: number, H: number): Node {
    const n = L(Node.create(name)); n.layer = UILAYER; n.addComponent(UITransform).setContentSize(W, H);
    this.node.addChild(n);
    const bg = L(this.rect(W + 400, H + 600, new Color(10, 10, 15, 255))); bg.setPosition(0, 0, 0); n.addChild(bg);
    if (this.loginBgSF) {
      const s = L(this.rect(W + 400, H + 600, Color.WHITE)); s.layer = UILAYER;
      s.getComponent(Sprite)!.spriteFrame = this.loginBgSF; s.getComponent(Sprite)!.color = new Color(90, 90, 110, 255);
      s.getComponent(Sprite)!.layer = UILAYER; s.setPosition(0, 0, 0); n.addChild(s);
    }
    return n;
  }
  rect(w: number, h: number, color: Color): Node {
    const n = L(Node.create('rect')); n.layer = UILAYER;
    const tr = n.addComponent(UITransform); tr.setContentSize(w, h); tr.setAnchorPoint(0.5, 0.5);
    const sp = n.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM; sp.spriteFrame = whiteSpriteFrame(); sp.color = color; sp.layer = UILAYER;
    return n;
  }
  txt(str: string, size: number, x: number, y: number, color: Color, parent?: Node): Node {
    const n = L(Node.create('txt')); n.layer = UILAYER;
    const tr = n.addComponent(UITransform); tr.setContentSize(400, size * 1.5); tr.setAnchorPoint(0.5, 0.5);
    const l = n.addComponent(Label); l.string = str; l.fontSize = size; l.lineHeight = Math.floor(size * 1.3);
    l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.color = color; l.layer = UILAYER;
    n.setPosition(x, y, 0);
    if (parent) parent.addChild(n);
    return n;
  }
  mkLbl(str: string, size: number, color: Color) {
    const n = L(Node.create('lbl')); n.layer = UILAYER;
    const tr = n.addComponent(UITransform); tr.setContentSize(220, size * 1.5);
    const l = n.addComponent(Label); l.string = str; l.fontSize = size; l.lineHeight = Math.floor(size * 1.3);
    l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.color = color; l.layer = UILAYER;
    return l;
  }
  neonBtn(str: string, w: number, h: number, cb: () => void): Node {
    const n = L(Node.create('btn' + str)); n.layer = UILAYER;
    const tr = n.addComponent(UITransform); tr.setContentSize(w, h); tr.setAnchorPoint(0.5, 0.5);
    n.addChild(L(this.rect(w, h, new Color(0, 0, 0, 100))));
    this.txt(str, Math.floor(h * 0.38), 0, 0, C.neon, n);
    const b = n.addComponent(Button); b.transition = Button.Transition.SCALE; b.target = n;
    n.on('click', cb);
    return n;
  }
  mkBtn(str: string, cb: () => void): Node {
    const n = L(Node.create('btn' + str)); n.layer = UILAYER;
    const tr = n.addComponent(UITransform); tr.setContentSize(110, 52); tr.setAnchorPoint(0.5, 0.5);
    n.addChild(L(this.rect(110, 52, C.btn)));
    this.txt(str, 18, 0, 0, C.white, n);
    const b = n.addComponent(Button); b.transition = Button.Transition.SCALE; b.target = n;
    n.on('click', cb);
    return n;
  }
}
