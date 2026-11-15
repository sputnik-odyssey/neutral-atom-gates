# 量子门与中性原子计算

中文交互式物理讲义：单比特门、双比特门、保真度、中性原子实现与多分支衰变。

在线访问：https://sputnik-odyssey.github.io/neutral-atom-gates/

## 交互功能

- X/Y/Z/H 复振幅演化、布洛赫球与贝尔态制备。
- 贝尔态相干项与态保真度演示。
- π–2π–π 里德堡阻塞门和相位补偿。
- 可调脉冲面积误差、纯退相干、有限阻塞、自发衰变、固定失谐。
- 三个可调衰变分支：回到 |0⟩、回到 |1⟩、进入吸收态 |ℓ⟩。比例自动保持总和 100%，总衰变率 Γ 不变。
- 同一控制参数下的分支对照，以及平均门保真度、测试态保真度、过程重叠、逻辑改变和其他态泄漏。
- 无驱动自由演化的解析对照、概念检查与参考文献。
- 与 Tsai、Sun 等 arXiv:2407.20184v2 的阅读对应说明，不声称复现论文。

所有计算均在浏览器本地完成，不收集数据，无第三方运行依赖。无需上传论文 PDF 或实验数据。

## 当前数值模型

`branching.mjs`：每原子采用 0、1、r、ℓ 四个状态，联合维数 16；计算基索引为 0、1、4、5。ℓ 不受驱动且不返回其他态。相互作用只作用于 rr。

哈密顿量：H/ℏ = Ω₀(1+ε)(|1⟩⟨r|ⱼ+h.c.)/2 − Δ(nᵣ,c+nᵣ,t) + bΩ₀|rr⟩⟨rr|。

三个脉冲时长 π/Ω₀、2π/Ω₀、π/Ω₀；门时长 t_g=4π/Ω₀，δ=Δ/Ω₀。两个原子的独立通道为 Lφ,ⱼ=√(2γφ)nᵣ,ⱼ 和 Jₖ,ⱼ=√(Γβₖ)|k⟩⟨r|ⱼ，k=0,1,ℓ，Σβₖ=1。

每 π 时长 128 步，采用解析酉块、精确多分支 Kraus 通道与纯退相干通道的对称分裂。每条衰变分支独立作用，不能相干叠加跳跃算符。实际完整密度矩阵保持迹为 1。

F_avg=(P_comp+4F_e)/5 使用包含泄漏的 Haar 平均恒等式；F_e 不再用物理测试输入 |++⟩ 的输出保真度代替。计算混合输入给出平均存留率，辅助迹递减映射用于过程重叠，并以所有 16 个逻辑输入算符传播验证。逻辑改变 P_flip 指计算基真值表中的错误，不统计纯相位误差。

辅助映射只保留不发生跃迁和 r→1 跳跃的轨迹。r→0 跳跃会不可逆地改变某个逻辑 1，r→ℓ 跳跃离开计算空间，这些 Kraus 路径对相对于对角 CZ 的迹重叠为零。该结构只用于加速过程重叠计算，不对真实通道后选择或归一化。

主线程计算当前参数，`noise-worker.mjs` 在后台计算扫描和分支对照，旧请求会被丢弃。`noise.mjs` 保留前一版闭合三能级模型及单脉冲解析函数，用于回归核对；生产交互使用 `branching.mjs`。

模型中的其他态是聚合的不可返回状态，未逐态描述真实辐射级联、黑体诱导跃迁、再泵浦、原子运动或实验读出；可调比例不是某个物种的实测分支比。

## 验证

```sh
node --test noise.test.mjs branching.test.mjs
python3 reference_branching.py
```

独立 Python 参考使用 NumPy，按 RK4 直接传播全部 16 个逻辑输入算符；网站本身不需要 Python。测试核对解析衰变、归一性、旧版闭合极限、逻辑改变、吸收态、通道平均、独立参考与步长收敛。

## 本地运行与发布

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

打开 http://127.0.0.1:8765/ 。JavaScript 模块和后台 Worker 需要 HTTP 服务，不能直接以 file:// 打开。

GitHub Pages：Settings → Pages → Deploy from a branch → main → / (root)。无需构建。

## 文献

1. Jones et al. (2007). https://arxiv.org/abs/quant-ph/0609134
2. Isenhower et al. (2010). https://arxiv.org/abs/0907.5552
3. Evered et al. (2023). https://doi.org/10.1038/s41586-023-06481-y
4. Bluvstein et al. (2024; online 2023). https://doi.org/10.1038/s41586-023-06927-3
5. Zhang et al. (2012). https://arxiv.org/abs/1201.6370
6. Nielsen (2002). https://arxiv.org/abs/quant-ph/0205035
7. Tsai, Sun et al., Benchmarking and fidelity response theory of high-fidelity Rydberg entangling gates, arXiv:2407.20184v2. https://arxiv.org/abs/2407.20184
