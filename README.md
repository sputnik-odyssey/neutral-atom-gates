# 量子门，从抽象到原子

一份中文交互式物理讲义，串联单比特门、双比特纠缠门、保真度与中性原子实验实现。

在线访问：https://sputnik-odyssey.github.io/neutral-atom-gates/

## 内容与交互

- X / Y / Z / H 门的复振幅计算、布洛赫球投影与测量概率。
- 从 |00⟩ 经 H 和 CNOT 制备贝尔态，显示纯态 concurrence。
- 贝尔态退相干模型：相干项、态保真度与保持不变的计算基测量概率。
- ⁸⁷Rb 超精细态编码、拉曼操控与里德堡阻塞原理。
- 可选择四个计算基输入的 π–2π–π 脉冲示意，包含原始相位及单比特相位补偿。
- 三道附解释的概念检查，以及四篇原始研究的引用。

交互均在浏览器本地运行，不收集数据，无第三方运行依赖。模型为教学用理想模型，不是硬件仿真或实验性能预测。里德堡演示假定完全阻塞，激光选择性耦合 |1⟩ ↔ |r⟩，忽略衰变等噪声。共振脉冲相位一致时，三脉冲原始门为 diag(1, −1, −1, −1)；补偿 Z ⊗ Z 后得到 CZ。

## 本地运行

需要通过 HTTP 服务加载 JavaScript 模块，例如：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开 http://127.0.0.1:8765/ 。

## GitHub Pages

在仓库 Settings → Pages 中，选择 Deploy from a branch，分支 main，目录 / (root)。无需构建步骤。

## 文件

- `index.html`：讲义、可访问的语义结构与引用。
- `style.css`：响应式版面与打印样式。
- `physics.mjs`：纯函数形式的理想模型计算。
- `app.mjs`：交互、状态更新与概念检查。

## 原始研究

1. Jones et al., *Fast Quantum State Control of a Single Trapped Neutral Atom*, PRA (2007). https://arxiv.org/abs/quant-ph/0609134
2. Isenhower et al., *Demonstration of a Neutral Atom Controlled-NOT Quantum Gate*, PRL (2010). https://arxiv.org/abs/0907.5552
3. Evered et al., *High-fidelity parallel entangling gates on a neutral-atom quantum computer*, Nature (2023). https://doi.org/10.1038/s41586-023-06481-y
4. Bluvstein et al., *Logical quantum processor based on reconfigurable atom arrays*, Nature (2024; online 2023). https://doi.org/10.1038/s41586-023-06927-3
