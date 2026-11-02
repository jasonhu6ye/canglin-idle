// 服务器结算程序「game」（11-02）。真正的代码在 src/server/edge.ts，GitHub Actions（.github/workflows/game-server.yml）
// 部署前用 esbuild 把它连同 src/core 打包成旁边的 bundle.js，所以服务器上的结算永远和游戏同一版本。
import './bundle.js';
