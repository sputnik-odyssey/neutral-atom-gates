# 量子门与中性原子计算

一份中文交互式物理讲义，串联单比特门、双比特纠缠门、保真度与中性原子实验实现。

在线访问：https://sputnik-odyssey.github.io/neutral-atom-gates/

## 内容与交互

- X / Y / Z / H 门的复振幅计算、布洛赫球投影与测量概率。
- 从 |00⟩ 经 H 和 CNOT 制备贝尔态，显示纯态 concurrence。
- 贝尔态退相干模型：相干项、态保真度与保持不变的计算基测量概率。
- ⁸⁷Rb 超精细态编码、拉曼操控与里德堡阻塞原理。
- 可选择四个计算基输入的 π–2π–π 脉冲示意，包含原始相位及单比特相位补偿。
- 三道附解释的概念检查，以及六篇研究文献的引用。

交互均在浏览器本地运行，不收集数据，无第三方运行依赖。原有演示使用理想模型；新增误差分析使用明确限定的九能级主方程模型。模型用于教学，不代表特定硬件性能。里德堡演示假定完全阻塞，激光选择性耦合 |1⟩ ↔ |r⟩，忽略衰变等噪声。共振脉冲相位一致时，三脉冲原始门为 diag(1, −1, −1, −1)；补偿 Z ⊗ Z 后得到 CZ。

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


## 双比特门误差演示

`noise.mjs` 计算九能级密度矩阵，基顺序为 00、01、0r、10、11、1r、r0、r1、rr。三个矩形脉冲的设计时长为 π/Ω₀、2π/Ω₀、π/Ω₀；实际拉比频率为 (1+ε)Ω₀。相互作用哈密顿量为 ℏbΩ₀|rr⟩⟨rr|。两个独立纯退相干通道采用 Lⱼ=√(2γφ)nᵣ,ⱼ，以 g=γφt_g 参数化。

程序用解析二能级块的酉演化与精确退相干通道进行对称分裂，每 π 时长 128 步。所有显示指标均包含泄漏，不进行后选择。未包含自发衰变、中间态散射、多能级结构、运动、SPAM 或脉冲优化。

对于这里保持逻辑扇区的特殊通道，F_avg=(P_comp+4F_test)/5。此关系由 Haar 平均公式与扇区结构导出，并经全部 16 个逻辑输入算符的独立传播核对；它不是对任意通道成立的单一测试态估计。

界面支持三个误差参数、五种预设、保真度扫描与数值表、脉冲序列中的里德堡布居，以及模型方程。`error-demo.mjs` 管理交互，`errors.css` 提供图表和响应式排版。

验证命令：

```sh
node --test noise.test.mjs
```

测试包括无误差极限、无相互作用极限、迹与厄米性、16 算符平均门保真度核对、步长收敛，并与独立四阶 Runge–Kutta 主方程积分的参考结果比较。

5. Zhang et al., *Fidelity of a Rydberg blockade quantum gate from simulated quantum process tomography*, PRA (2012). https://arxiv.org/abs/1201.6370
6. Nielsen, *A simple formula for the average gate fidelity of a quantum dynamical operation*, Physics Letters A (2002). https://arxiv.org/abs/quant-ph/0205035
