export const PAPER = 'https://doi.org/10.1038/s41586-025-09596-6';
export const AOSENSE = 'https://aosense.com/products/atom-beam-sources/cold-atomic-beam-system/';
export const EQUIPMENT = [
  { id: 'mot', view: 'rb', name: 'Precision Glassblowing', model: '定制 MOT 玻璃池', kind: '论文实装 · 定制件', role: '容纳铷原子与磁光阱。它提供真空中的冷却空间；玻璃池本身不执行激光冷却。', source: PAPER, x: 13, y: 32 },
  { id: 'tube', view: 'rb', name: 'Limit Vacuum Technology', model: '定制差分抽气管', kind: '论文实装 · 定制件', role: '连接捕获区与科学腔，限制气体流动，并通过装置几何减少 MOT 散射光进入存储区。', source: PAPER, x: 34, y: 34 },
  { id: 'cell', view: 'rb', name: 'Akatsuki Technology', model: '定制科学玻璃腔', kind: '论文实装 · 定制件', role: '提供光晶格、光镊、制备和存储所在的真空空间。右侧是腔内原子分区的放大示意。', source: PAPER, x: 55, y: 30 },
  { id: 'objective', view: 'rb', name: 'Special Optics', model: '定制物镜与中继光学', kind: '论文实装 · 定制件', role: '把光镊聚焦到科学腔内，并收集原子荧光。光学元件位于原子的光路上，不是原子束穿行的管道。', source: PAPER, x: 55, y: 71 },
  { id: 'laser', view: 'rb', name: 'Precilaser', model: '828 / 852 nm 光纤放大激光系统', kind: '论文实装 · 未给出目录型号', role: '828 nm 光用于动态光镊，852 nm 光用于静态光镊。图中此光源支路不代表运输晶格的激光源。', source: PAPER, x: 18, y: 86 },
  { id: 'aod', view: 'rb', name: 'G&H', model: 'AODF4085（正交双 AOD）', kind: '论文实装 · 型号可核验', role: '射频改变声波及衍射角，扫描光镊的位置。被移动的是焦点中的原子；原子不穿过声光器件。', source: PAPER, x: 43, y: 86 },
  { id: 'slm', view: 'rb', name: 'Hamamatsu', model: 'X15213-02R · LCOS-SLM', kind: '论文实装 · 厂家型号', role: '调制光的空间相位，生成静态光镊阵列。论文使用两条独立的 SLM 光路；图中合并画为一组。', source: 'https://www.hamamatsu.com/us/en/product/optical-components/lcos-slm/high_power_laser_type/X15213-02R.html', x: 66, y: 86 },
  { id: 'camera', view: 'rb', name: 'Hamamatsu', model: 'C15550-20UP · ORCA-Quest', kind: '论文实装 · 厂家型号', role: '收集原子荧光形成占据图像，为后续挑选和排序提供经典信息；相机接收到的是光子。', source: 'https://www.hamamatsu.com/us/en/news/products-and-technologies/2021/20210510000000.html', x: 55, y: 14 },
  { id: 'control', view: 'rb', name: 'NI / Spectrum Instrumentation', model: 'PXIe-6535 / PXIe-6738；DN2.663-04 / M4i.6631-x8', kind: '论文实装 · 控制与波形硬件', role: '数字、模拟控制与任意波形发生器组织时序，并产生驱动 AOD 的射频波形。连线为控制关系示意，不是端口接线图。', source: PAPER, x: 89, y: 86 },
  { id: 'aosense', view: 'sr', name: 'AOSense', model: 'Beam-RevD-Sr', kind: '厂家冷原子束系统 · ⁸⁸Sr 示意', role: '真实产品把原子炉、永磁塞曼减速器和真空内 2D MOT 光学集成在冷原子束源中。这里展开其功能链，不声称复现内部尺寸、磁场或接口接线。', source: AOSENSE, x: 50, y: 78 },
];
export const STAGES = {
  rb: [
    { title: '捕获：先建立冷原子供给', short: 'MOT 捕获', body: '磁光阱（MOT）用光与磁场冷却、捕获原子。随后由光晶格接走一批原子。此时科学腔中的旧原子仍可留在存储区。', device: 'mot' },
    { title: '运输：把捕获区与存储区分开', short: '晶格运输', body: '移动的光晶格势阱携带原子，经差分抽气管进入独立科学腔。空间分离、真空设计与光隔离共同降低补给对已存储比特的干扰。', device: 'tube' },
    { title: '提取：从储库装入动态光镊', short: '储库提取', body: '科学腔中的光晶格形成原子储库。正交 AOD 控制的光镊从中提取原子并送往制备区；储库和最终计算阵列是不同的层级。', device: 'aod' },
    { title: '制备：确认占据，再排列和初始化', short: '成像与制备', body: '荧光成像给出哪些位置有原子。冷却、选择、排序及内部态初始化使新原子成为可使用的寄存器资源。源的原子通量不能直接当作可用比特速率。', device: 'camera' },
    { title: '搬运：把新子阵列送到存储区', short: '搬运新阵列', body: '动态光镊把已准备好的新原子移动到指定位置，静态光镊负责长期俘获。动画放慢并拆开这些步骤；真实装置中上游供给与下游制备可以流水执行。', device: 'slm' },
    { title: '更新：替换一组，保留其余五组', short: '轮换子阵列', body: '本例按已发表的六组子阵列协议轮换：移走最旧的一组，再装入新的一组。它不是逐个寻找空位补洞。新原子具有重新制备的初态，不会自动恢复旧原子的未知量子态。', device: 'control' },
  ],
  sr: [
    { title: '原子炉：提供热原子', short: '热原子束', body: '原子炉使锶原子进入束流。热原子仍有较高的速度和较宽的速度分布，需要后续减速与冷却。这里的器件是 Beam-RevD-Sr 的集成部分，不另行虚构炉的商品型号。', device: 'aosense' },
    { title: '塞曼减速：使散射力持续作用', short: '塞曼减速', body: '原子减速时，多普勒频移随速度变化。空间变化的磁场通过塞曼频移补偿这一变化，使反向激光能持续接近共振。本产品采用永磁体结构。', device: 'aosense' },
    { title: '2D MOT：横向冷却与约束', short: '横向冷却', body: '二维磁光阱主要降低横向速度并约束束流。轴向仍有净输出，所以得到的是冷原子束，而不是已经排好的单原子光镊阵列。', device: 'aosense' },
    { title: '输出：冷原子束进入用户真空系统', short: '冷束输出', body: '输出端之后还需接收、进一步冷却、俘获、成像、排序和内部态制备，才能建立计算寄存器。此图到源的输出为止，不把锶源接到左侧的铷实验上。', device: 'aosense' },
  ],
};
