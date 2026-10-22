# 苍岭放置（暂定名）

参考 Deep Vein Idle 的网页放置游戏，当前是 M1 单机原型。

```bash
npm install
npm run dev      # 本地开发 http://localhost:5173
npm test         # 结算逻辑测试
npm run build    # 打包到 dist/
npx vite-node scripts/balance.ts   # 战斗数值模拟
```

## 目录

- `src/core/` 纯逻辑，不依赖浏览器：数据表 `data.ts`、经验曲线 `xp.ts`、结算 `sim.ts`（在线 tick 和离线补算共用 `advance()`，结果与分段方式无关）。以后搬到服务器直接复用。
- `src/game/` Phaser 地图场景；`sprites.ts` 是字符画占位美术，换正式美术时替换这里。
- `src/ui/` React 面板（队列、行动选择、背包、技能、离线收获）。
- `src/store.ts` 存档（localStorage）、200ms 定时结算、切回前台补算。
