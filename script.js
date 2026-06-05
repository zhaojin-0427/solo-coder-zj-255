const KNIFE_TYPES = {
    chef: { name: '厨刀', minAngle: 15, maxAngle: 20, defaultAngle: 17.5, useCase: '日常切菜、切肉' },
    outdoor: { name: '户外刀', minAngle: 20, maxAngle: 30, defaultAngle: 25, useCase: '户外生存、切割硬物' },
    razor: { name: '剃刀', minAngle: 8, maxAngle: 12, defaultAngle: 10, useCase: '剃须、精细切割' },
    utility: { name: '水果刀', minAngle: 12, maxAngle: 18, defaultAngle: 15, useCase: '切水果、小型食材' },
    cleaver: { name: '斩骨刀', minAngle: 25, maxAngle: 35, defaultAngle: 30, useCase: '斩骨、切割硬物' },
    fillet: { name: '鱼片刀', minAngle: 10, maxAngle: 15, defaultAngle: 12, useCase: '处理鱼肉、精细片切' },
    custom: { name: '自定义', minAngle: 5, maxAngle: 40, defaultAngle: 20, useCase: '自定义用途' }
};

const SHARPNESS_THRESHOLDS = {
    excellent: 3,
    good: 8,
    fair: 15
};

const STORAGE_KEY = 'knife_grinding_data';
const COMPARISON_STORAGE_KEY = 'knife_grinding_comparison';
const MAX_COMPARISON_COUNT = 3;

let currentMode = 'forward';
let comparisonList = [];

function init() {
    bindEvents();
    onKnifeTypeChange();
    updateCalculations();
    drawDecayChart();
    updateKnifeDiagram();
    updateMaterialPreview();
    loadComparison();
    renderComparisonTable();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function bindEvents() {
    document.getElementById('knifeType').addEventListener('change', onKnifeTypeChange);
    document.getElementById('grindAngle').addEventListener('input', onSliderChange);
    document.getElementById('steelHardness').addEventListener('input', onSliderChange);
    document.getElementById('edgeThickness').addEventListener('input', onSliderChange);
    document.getElementById('bladeStock').addEventListener('input', onSliderChange);

    document.getElementById('forwardMode').addEventListener('click', () => switchMode('forward'));
    document.getElementById('reverseMode').addEventListener('click', () => switchMode('reverse'));

    document.getElementById('measuredEdgeWidth').addEventListener('input', updateReverseSliderValues);
    document.getElementById('bevelLength').addEventListener('input', updateReverseSliderValues);
    document.getElementById('currentSharpness').addEventListener('input', updateReverseSliderValues);
    document.getElementById('calculateReverse').addEventListener('click', calculateReverse);
    document.getElementById('closeModal').addEventListener('click', closeModal);

    document.getElementById('saveBtn').addEventListener('click', saveKnifeData);
    document.getElementById('loadBtn').addEventListener('click', showSavedKnives);
    document.getElementById('addToCompareBtn').addEventListener('click', addToComparison);
    document.getElementById('clearComparisonBtn').addEventListener('click', clearComparison);
    document.getElementById('exportBtn').addEventListener('click', exportChecklist);
    document.getElementById('printBtn').addEventListener('click', printReferenceCard);

    document.getElementById('reverseResultModal').addEventListener('click', (e) => {
        if (e.target.id === 'reverseResultModal') closeModal();
    });
}

function onKnifeTypeChange() {
    const type = document.getElementById('knifeType').value;
    const config = KNIFE_TYPES[type];
    const angleSlider = document.getElementById('grindAngle');
    
    angleSlider.min = config.minAngle;
    angleSlider.max = config.maxAngle;
    angleSlider.value = config.defaultAngle;
    
    updateAngleSliderLabels(config.minAngle, config.maxAngle);
    
    onSliderChange();
}

function updateAngleSliderLabels(minAngle, maxAngle) {
    const range = maxAngle - minAngle;
    document.getElementById('angleLabelMin').textContent = minAngle + '°';
    document.getElementById('angleLabel2').textContent = (minAngle + range * 0.33).toFixed(0) + '°';
    document.getElementById('angleLabel3').textContent = (minAngle + range * 0.66).toFixed(0) + '°';
    document.getElementById('angleLabelMax').textContent = maxAngle + '°';
}

function onSliderChange() {
    updateSliderValues();
    updateCalculations();
    updateKnifeDiagram();
    updateMaterialPreview();
    drawDecayChart();
}

function updateSliderValues() {
    document.getElementById('angleValue').textContent = document.getElementById('grindAngle').value;
    document.getElementById('hardnessValue').textContent = document.getElementById('steelHardness').value;
    document.getElementById('thicknessValue').textContent = document.getElementById('edgeThickness').value;
    document.getElementById('stockValue').textContent = document.getElementById('bladeStock').value;
}

function updateReverseSliderValues() {
    document.getElementById('measuredWidthValue').textContent = document.getElementById('measuredEdgeWidth').value;
    document.getElementById('bevelLengthValue').textContent = document.getElementById('bevelLength').value;
    document.getElementById('sharpnessValue').textContent = document.getElementById('currentSharpness').value;
}

function switchMode(mode) {
    currentMode = mode;
    
    document.getElementById('forwardMode').classList.toggle('active', mode === 'forward');
    document.getElementById('reverseMode').classList.toggle('active', mode === 'reverse');
    document.getElementById('forwardPanel').style.display = mode === 'forward' ? 'block' : 'none';
    document.getElementById('reversePanel').style.display = mode === 'reverse' ? 'block' : 'none';
}

function calculateMaterialRemoval(angle, stock, edgeThickness) {
    const angleRad = (angle * Math.PI) / 180;
    const halfStock = stock / 2;
    const edgeThicknessMm = edgeThickness / 1000;
    
    const originalBevelHeight = halfStock / Math.tan(angleRad);
    const newBevelHeight = (halfStock - edgeThicknessMm / 2) / Math.tan(angleRad);
    
    const removalArea = 0.5 * (originalBevelHeight - newBevelHeight) * (halfStock - edgeThicknessMm / 2) * 2;
    
    return Math.max(0, removalArea);
}

function calculateTheoreticalSharpness(angle, edgeThickness, hardness) {
    const angleFactor = Math.pow(angle / 10, 0.8);
    const thicknessFactor = Math.pow(edgeThickness / 10, 0.6);
    const hardnessFactor = Math.pow((70 - hardness) / 10, 0.4);
    
    const sharpness = 0.5 + angleFactor * 0.8 + thicknessFactor * 1.2 + hardnessFactor * 0.5;
    
    return Math.max(0.5, Math.min(50, sharpness));
}

function calculateEdgeRadius(edgeThickness, angle) {
    const angleRad = (angle * Math.PI) / 180;
    const radius = (edgeThickness / 2) * Math.sin(angleRad / 2);
    return Math.max(0.1, radius);
}

function calculateDurability(angle, hardness) {
    const angleFactor = Math.pow(angle / 15, 1.5);
    const hardnessFactor = Math.pow(hardness / 55, 2.5);
    
    const baseDurability = 500;
    const durability = baseDurability * angleFactor * hardnessFactor;
    
    return Math.round(durability);
}

function updateCalculations() {
    const angle = parseFloat(document.getElementById('grindAngle').value);
    const hardness = parseFloat(document.getElementById('steelHardness').value);
    const edgeThickness = parseFloat(document.getElementById('edgeThickness').value);
    const stock = parseFloat(document.getElementById('bladeStock').value);
    
    const materialRemoval = calculateMaterialRemoval(angle, stock, edgeThickness);
    const sharpness = calculateTheoreticalSharpness(angle, edgeThickness, hardness);
    const edgeRadius = calculateEdgeRadius(edgeThickness, angle);
    const durability = calculateDurability(angle, hardness);
    
    document.getElementById('materialRemoval').textContent = materialRemoval.toFixed(4);
    document.getElementById('theoreticalSharpness').textContent = sharpness.toFixed(1);
    document.getElementById('edgeRadius').textContent = edgeRadius.toFixed(2);
    document.getElementById('durability').textContent = durability.toLocaleString();
    
    updateSharpnessPointer(sharpness);
}

function updateSharpnessPointer(sharpness) {
    const pointer = document.getElementById('sharpnessPointer');
    let position;
    
    if (sharpness < SHARPNESS_THRESHOLDS.excellent) {
        position = (sharpness / SHARPNESS_THRESHOLDS.excellent) * 25;
    } else if (sharpness < SHARPNESS_THRESHOLDS.good) {
        position = 25 + ((sharpness - SHARPNESS_THRESHOLDS.excellent) / (SHARPNESS_THRESHOLDS.good - SHARPNESS_THRESHOLDS.excellent)) * 25;
    } else if (sharpness < SHARPNESS_THRESHOLDS.fair) {
        position = 50 + ((sharpness - SHARPNESS_THRESHOLDS.good) / (SHARPNESS_THRESHOLDS.fair - SHARPNESS_THRESHOLDS.good)) * 25;
    } else {
        position = 75 + Math.min(25, ((sharpness - SHARPNESS_THRESHOLDS.fair) / 10) * 25);
    }
    
    pointer.style.left = `${Math.min(97, Math.max(3, position))}%`;
}

function calculateDecayCurve(initialSharpness, durability, hardness) {
    const points = [];
    const maxCuts = durability * 2;
    const step = maxCuts / 50;
    
    const hardnessFactor = Math.pow(hardness / 60, 0.5);
    
    for (let cuts = 0; cuts <= maxCuts; cuts += step) {
        const wearFactor = Math.pow(cuts / durability, 1.2);
        const sharpness = initialSharpness * (1 + wearFactor * hardnessFactor * 1.5);
        points.push({ cuts, sharpness: Math.min(sharpness, 50) });
    }
    
    return points;
}

function drawDecayChart() {
    const canvas = document.getElementById('decayChart');
    const ctx = canvas.getContext('2d');
    
    const angle = parseFloat(document.getElementById('grindAngle').value);
    const hardness = parseFloat(document.getElementById('steelHardness').value);
    const edgeThickness = parseFloat(document.getElementById('edgeThickness').value);
    
    const initialSharpness = calculateTheoreticalSharpness(angle, edgeThickness, hardness);
    const durability = calculateDurability(angle, hardness);
    
    const points = calculateDecayCurve(initialSharpness, durability, hardness);
    
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();
    }
    
    for (let i = 0; i <= 5; i++) {
        const x = padding.left + (chartWidth / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();
    }
    
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        const value = 50 - i * 10;
        ctx.fillText(value + 'N', padding.left - 5, y + 3);
    }
    
    ctx.textAlign = 'center';
    const maxCuts = points[points.length - 1].cuts;
    for (let i = 0; i <= 5; i++) {
        const x = padding.left + (chartWidth / 5) * i;
        const value = Math.round((maxCuts / 5) * i / 100) * 100;
        ctx.fillText(value, x, canvas.height - padding.bottom + 15);
    }
    
    ctx.fillText('切割次数', canvas.width / 2, canvas.height - 5);
    
    ctx.save();
    ctx.translate(12, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('锋利度 (N)', 0, 0);
    ctx.restore();
    
    const thresholdY = padding.top + chartHeight * (1 - SHARPNESS_THRESHOLDS.fair / 50);
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, thresholdY);
    ctx.lineTo(canvas.width - padding.right, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    points.forEach((point, index) => {
        const x = padding.left + (point.cuts / maxCuts) * chartWidth;
        const y = padding.top + chartHeight * (1 - point.sharpness / 50);
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    ctx.fillStyle = '#2196F3';
    points.forEach((point, index) => {
        if (index % 5 === 0 || index === points.length - 1) {
            const x = padding.left + (point.cuts / maxCuts) * chartWidth;
            const y = padding.top + chartHeight * (1 - point.sharpness / 50);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function updateKnifeDiagram() {
    const angle = parseFloat(document.getElementById('grindAngle').value);
    const stock = parseFloat(document.getElementById('bladeStock').value);
    
    const angleRad = (angle * Math.PI) / 180;
    const halfHeight = stock * 8;
    
    const centerY = 100;
    const edgeX = 280;
    const topY = centerY - halfHeight;
    const bottomY = centerY + halfHeight;
    
    document.getElementById('bladeShape').setAttribute('points', 
        `20,${centerY} ${edgeX},${topY} ${edgeX},${bottomY} 20,${centerY}`
    );
    
    const edgeTopY = centerY - halfHeight * 0.8;
    const edgeBottomY = centerY + halfHeight * 0.8;
    document.getElementById('edgeShape').setAttribute('points', 
        `${edgeX},${edgeTopY} ${edgeX},${edgeBottomY} ${edgeX + 15},${centerY}`
    );
    
    const arcRadius = 30;
    const angleLineEndY = centerY - arcRadius * Math.sin(angleRad);
    const angleLineEndX = edgeX - arcRadius * Math.cos(angleRad);
    
    document.getElementById('angleLine2').setAttribute('x1', edgeX);
    document.getElementById('angleLine2').setAttribute('y1', centerY);
    document.getElementById('angleLine2').setAttribute('x2', angleLineEndX);
    document.getElementById('angleLine2').setAttribute('y2', angleLineEndY);
    
    const arcStartX = edgeX - arcRadius;
    const arcStartY = centerY;
    const arcEndX = angleLineEndX;
    const arcEndY = angleLineEndY;
    
    const largeArc = angle > 90 ? 1 : 0;
    document.getElementById('angleArc').setAttribute('d',
        `M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 ${largeArc} 0 ${arcEndX} ${arcEndY}`
    );
    
    document.getElementById('angleText').setAttribute('x', edgeX - arcRadius - 10);
    document.getElementById('angleText').setAttribute('y', centerY - arcRadius / 2);
    document.getElementById('angleText').textContent = angle + '°';
    
    document.getElementById('thicknessLabel').textContent = `刃厚: ${stock.toFixed(1)} mm`;
}

function updateMaterialPreview() {
    const angle = parseFloat(document.getElementById('grindAngle').value);
    const edgeThickness = parseFloat(document.getElementById('edgeThickness').value);
    
    const angleRad = (angle * Math.PI) / 180;
    const scale = 2;
    
    const removalDepth = (edgeThickness / 100) * scale;
    let removalLength = removalDepth / Math.tan(angleRad);
    
    const maxLength = 15;
    if (removalLength > maxLength) {
        const scaleFactor = maxLength / removalLength;
        removalLength = maxLength;
    }
    
    const tipX = Math.min(180 + removalLength, 198);
    const tipY = 50 - removalDepth / 2;
    
    document.getElementById('removedMaterial').setAttribute('points',
        `180,45 180,55 ${tipX},${tipY}`
    );
    
    document.getElementById('newEdge').setAttribute('points',
        `180,45 ${tipX},${tipY} 180,55`
    );
}

function calculateReverse() {
    const measuredWidth = parseFloat(document.getElementById('measuredEdgeWidth').value);
    const bevelLength = parseFloat(document.getElementById('bevelLength').value);
    const currentSharpness = parseFloat(document.getElementById('currentSharpness').value);
    const hardness = parseFloat(document.getElementById('steelHardness').value);
    
    const bevelLengthUm = bevelLength * 1000;
    const ratio = Math.min(measuredWidth / (2 * bevelLengthUm), 1);
    const calculatedAngle = Math.asin(ratio) * 2 * (180 / Math.PI);
    
    const knifeType = document.getElementById('knifeType').value;
    const config = KNIFE_TYPES[knifeType];
    
    const idealSharpness = calculateTheoreticalSharpness(calculatedAngle, measuredWidth, hardness);
    const conditionRatio = currentSharpness / idealSharpness;
    
    let angleStatus, conditionStatus;
    let suggestions = [];
    
    if (calculatedAngle >= config.minAngle && calculatedAngle <= config.maxAngle) {
        angleStatus = 'good';
        suggestions.push('当前研磨角度在推荐范围内');
    } else if (calculatedAngle < config.minAngle) {
        angleStatus = 'warning';
        suggestions.push(`角度偏小，建议增加到 ${config.minAngle}° 以上以提高耐用度`);
    } else {
        angleStatus = 'warning';
        suggestions.push(`角度偏大，建议减小到 ${config.maxAngle}° 以下以提高锋利度`);
    }
    
    if (conditionRatio < 1.5) {
        conditionStatus = 'good';
        suggestions.push('刃口状态良好，保持正常使用');
    } else if (conditionRatio < 2.5) {
        conditionStatus = 'warning';
        suggestions.push('刃口开始钝化，建议进行维护研磨');
    } else {
        conditionStatus = 'error';
        suggestions.push('刃口严重钝化，需要重新研磨');
    }
    
    const estimatedEdgeRadius = calculateEdgeRadius(measuredWidth, calculatedAngle);
    const estimatedDurability = calculateDurability(calculatedAngle, hardness);
    
    let remainingCuts;
    if (currentSharpness < SHARPNESS_THRESHOLDS.fair) {
        const decayRate = Math.pow(hardness / 60, 0.5);
        const wearFactor = Math.pow((currentSharpness / idealSharpness - 1) / 1.5, 1 / 1.2);
        remainingCuts = Math.round(estimatedDurability * Math.max(0, 1 - wearFactor));
    } else {
        remainingCuts = 0;
    }
    
    showReverseResult({
        calculatedAngle,
        recommendedAngle: config.defaultAngle,
        angleRange: `${config.minAngle}° - ${config.maxAngle}°`,
        angleStatus,
        conditionStatus,
        conditionRatio,
        idealSharpness,
        estimatedEdgeRadius,
        estimatedDurability,
        remainingCuts,
        suggestions
    });
}

function showReverseResult(result) {
    const modal = document.getElementById('reverseResultModal');
    const content = document.getElementById('reverseResultContent');
    
    content.innerHTML = `
        <div class="reverse-result-item ${result.angleStatus}">
            <div class="reverse-result-label">反推研磨角度</div>
            <div class="reverse-result-value">${result.calculatedAngle.toFixed(1)}°</div>
            <div style="font-size: 0.85rem; color: #666; margin-top: 5px;">
                推荐范围: ${result.angleRange}
            </div>
        </div>
        
        <div class="reverse-result-item ${result.conditionStatus}">
            <div class="reverse-result-label">刃口状态</div>
            <div class="reverse-result-value">
                ${result.conditionRatio < 1.5 ? '良好' : result.conditionRatio < 2.5 ? '一般' : '较差'}
            </div>
            <div style="font-size: 0.85rem; color: #666; margin-top: 5px;">
                实际/理论锋利度比: ${result.conditionRatio.toFixed(2)}
            </div>
        </div>
        
        <div class="reverse-result-item">
            <div class="reverse-result-label">预估刃口半径</div>
            <div class="reverse-result-value">${result.estimatedEdgeRadius.toFixed(2)} μm</div>
        </div>
        
        <div class="reverse-result-item">
            <div class="reverse-result-label">预计剩余切割次数</div>
            <div class="reverse-result-value">${result.remainingCuts.toLocaleString()}</div>
        </div>
        
        <div class="reverse-suggestion">
            <div style="font-weight: 600; margin-bottom: 8px;">建议</div>
            <ul style="padding-left: 20px; margin: 0;">
                ${result.suggestions.map(s => `<li style="margin-bottom: 5px;">${s}</li>`).join('')}
            </ul>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('reverseResultModal').style.display = 'none';
}

function saveKnifeData() {
    const name = document.getElementById('knifeName').value.trim();
    if (!name) {
        alert('请输入刀具名称');
        return;
    }
    
    const data = {
        id: Date.now(),
        name,
        type: document.getElementById('knifeType').value,
        angle: parseFloat(document.getElementById('grindAngle').value),
        hardness: parseFloat(document.getElementById('steelHardness').value),
        edgeThickness: parseFloat(document.getElementById('edgeThickness').value),
        stock: parseFloat(document.getElementById('bladeStock').value),
        createdAt: new Date().toISOString()
    };
    
    const saved = getSavedKnives();
    saved.push(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    
    alert(`刀具 "${name}" 已保存！`);
    showSavedKnives();
}

function getSavedKnives() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

function showSavedKnives() {
    const saved = getSavedKnives();
    const card = document.getElementById('savedKnivesCard');
    const list = document.getElementById('savedKnivesList');
    
    if (saved.length === 0) {
        card.style.display = 'none';
        alert('暂无保存的刀具数据');
        return;
    }
    
    card.style.display = 'block';
    list.innerHTML = saved.map(knife => `
        <div class="saved-knife-item">
            <div class="saved-knife-info">
                <div class="saved-knife-name">${escapeHtml(knife.name)}</div>
                <div class="saved-knife-details">
                    ${escapeHtml(KNIFE_TYPES[knife.type].name)} | ${knife.angle}° | HRC${knife.hardness} | 
                    ${new Date(knife.createdAt).toLocaleDateString()}
                </div>
            </div>
            <div class="saved-knife-actions">
                <button class="small-btn load" onclick="loadKnife(${knife.id})">加载</button>
                <button class="small-btn delete" onclick="deleteKnife(${knife.id})">删除</button>
            </div>
        </div>
    `).join('');
}

function loadKnife(id) {
    const saved = getSavedKnives();
    const knife = saved.find(k => k.id === id);
    
    if (!knife) return;
    
    document.getElementById('knifeType').value = knife.type;
    document.getElementById('knifeName').value = knife.name;
    
    const config = KNIFE_TYPES[knife.type];
    document.getElementById('grindAngle').min = config.minAngle;
    document.getElementById('grindAngle').max = config.maxAngle;
    document.getElementById('grindAngle').value = knife.angle;
    document.getElementById('steelHardness').value = knife.hardness;
    document.getElementById('edgeThickness').value = knife.edgeThickness;
    document.getElementById('bladeStock').value = knife.stock;
    
    onSliderChange();
    switchMode('forward');
}

function deleteKnife(id) {
    if (!confirm('确定要删除这把刀具的参数吗？')) return;
    
    let saved = getSavedKnives();
    saved = saved.filter(k => k.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    
    showSavedKnives();
}

function loadComparison() {
    const data = localStorage.getItem(COMPARISON_STORAGE_KEY);
    if (data) {
        try {
            comparisonList = JSON.parse(data);
        } catch (e) {
            comparisonList = [];
        }
    }
}

function saveComparison() {
    localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(comparisonList));
}

function addToComparison() {
    if (currentMode !== 'forward') {
        alert('请先切换到正向计算模式再加入对比');
        return;
    }

    if (comparisonList.length >= MAX_COMPARISON_COUNT) {
        alert(`最多只能对比 ${MAX_COMPARISON_COUNT} 个方案，请先删除部分方案`);
        return;
    }

    const angle = parseFloat(document.getElementById('grindAngle').value);
    const hardness = parseFloat(document.getElementById('steelHardness').value);
    const edgeThickness = parseFloat(document.getElementById('edgeThickness').value);
    const stock = parseFloat(document.getElementById('bladeStock').value);
    const knifeType = document.getElementById('knifeType').value;
    const knifeName = document.getElementById('knifeName').value.trim() || '未命名方案';

    const materialRemoval = calculateMaterialRemoval(angle, stock, edgeThickness);
    const sharpness = calculateTheoreticalSharpness(angle, edgeThickness, hardness);
    const edgeRadius = calculateEdgeRadius(edgeThickness, angle);
    const durability = calculateDurability(angle, hardness);

    const scheme = {
        id: Date.now(),
        knifeType,
        knifeName,
        angle,
        hardness,
        edgeThickness,
        stock,
        materialRemoval,
        sharpness,
        edgeRadius,
        durability,
        addedAt: new Date().toISOString()
    };

    comparisonList.push(scheme);
    saveComparison();
    renderComparisonTable();

    alert(`方案 "${knifeName}" 已加入对比`);
}

function deleteComparison(id) {
    if (!confirm('确定要删除此对比方案吗？')) return;
    
    comparisonList = comparisonList.filter(item => item.id !== id);
    saveComparison();
    renderComparisonTable();
}

function clearComparison() {
    if (comparisonList.length === 0) return;
    if (!confirm('确定要清空所有对比方案吗？')) return;
    
    comparisonList = [];
    saveComparison();
    renderComparisonTable();
}

function renderComparisonTable() {
    const card = document.getElementById('comparisonCard');
    const tableHead = document.querySelector('#comparisonTable thead tr');
    const tableBody = document.getElementById('comparisonTableBody');
    const countSpan = document.getElementById('comparisonCount');

    countSpan.textContent = `${comparisonList.length}/${MAX_COMPARISON_COUNT}`;

    if (comparisonList.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';

    let bestSharpness = Infinity;
    let bestDurability = -Infinity;
    let bestSharpnessId = null;
    let bestDurabilityId = null;

    comparisonList.forEach(item => {
        if (item.sharpness < bestSharpness) {
            bestSharpness = item.sharpness;
            bestSharpnessId = item.id;
        }
        if (item.durability > bestDurability) {
            bestDurability = item.durability;
            bestDurabilityId = item.id;
        }
    });

    tableHead.innerHTML = '<th>指标</th>' + comparisonList.map(item => {
        const typeName = KNIFE_TYPES[item.knifeType]?.name || item.knifeType;
        return `
            <th>
                <div class="comparison-scheme-header">${escapeHtml(item.knifeName)}</div>
                <div class="comparison-scheme-type">${escapeHtml(typeName)}</div>
                <button class="comparison-delete-btn" onclick="deleteComparison(${item.id})">删除</button>
            </th>
        `;
    }).join('');

    const rows = [
        { label: '研磨角度', key: 'angle', suffix: '°', format: v => v.toFixed(1) },
        { label: '钢材硬度', key: 'hardness', suffix: ' HRC', format: v => v.toFixed(0) },
        { label: '刃口厚度', key: 'edgeThickness', suffix: ' μm', format: v => v.toFixed(0) },
        { label: '刀身厚度', key: 'stock', suffix: ' mm', format: v => v.toFixed(1) },
        { label: '材料去除量', key: 'materialRemoval', suffix: ' mm³/mm', format: v => v.toFixed(4) },
        { label: '理论锋利度', key: 'sharpness', suffix: ' N', format: v => v.toFixed(1), highlight: 'sharpness' },
        { label: '刃口半径', key: 'edgeRadius', suffix: ' μm', format: v => v.toFixed(2) },
        { label: '耐用度', key: 'durability', suffix: ' 次', format: v => v.toLocaleString(), highlight: 'durability' }
    ];

    tableBody.innerHTML = rows.map(row => {
        const cells = comparisonList.map(item => {
            let highlightClass = '';
            if (row.highlight === 'sharpness' && item.id === bestSharpnessId) {
                highlightClass = 'highlight-best-sharpness';
            }
            if (row.highlight === 'durability' && item.id === bestDurabilityId) {
                highlightClass += ' highlight-best-durability';
            }
            return `<td class="${highlightClass.trim()}">${row.format(item[row.key])}${row.suffix}</td>`;
        }).join('');
        return `<tr><td>${row.label}</td>${cells}</tr>`;
    }).join('');
}

function exportChecklist() {
    const angle = parseFloat(document.getElementById('grindAngle').value);
    const hardness = parseFloat(document.getElementById('steelHardness').value);
    const edgeThickness = parseFloat(document.getElementById('edgeThickness').value);
    const stock = parseFloat(document.getElementById('bladeStock').value);
    const knifeType = document.getElementById('knifeType').value;
    const knifeName = document.getElementById('knifeName').value.trim() || '未命名刀具';
    
    const materialRemoval = calculateMaterialRemoval(angle, stock, edgeThickness);
    const sharpness = calculateTheoreticalSharpness(angle, edgeThickness, hardness);
    const edgeRadius = calculateEdgeRadius(edgeThickness, angle);
    const durability = calculateDurability(angle, hardness);
    
    let sharpnessLevel;
    if (sharpness < SHARPNESS_THRESHOLDS.excellent) sharpnessLevel = '极佳';
    else if (sharpness < SHARPNESS_THRESHOLDS.good) sharpnessLevel = '良好';
    else if (sharpness < SHARPNESS_THRESHOLDS.fair) sharpnessLevel = '一般';
    else sharpnessLevel = '需研磨';
    
    let checklist = `
刀具研磨检查清单
================
生成时间: ${new Date().toLocaleString()}

刀具信息
--------
刀具名称: ${knifeName}
刀具类型: ${KNIFE_TYPES[knifeType].name}
适用场景: ${KNIFE_TYPES[knifeType].useCase}

研磨参数
--------
设定研磨角度: ${angle}°
推荐角度范围: ${KNIFE_TYPES[knifeType].minAngle}° - ${KNIFE_TYPES[knifeType].maxAngle}°
钢材硬度: HRC ${hardness}
当前刃口厚度: ${edgeThickness} μm
刀身厚度: ${stock} mm

计算结果
--------
材料去除量: ${materialRemoval.toFixed(4)} mm³/mm
理论锋利度: ${sharpness.toFixed(1)} N (${sharpnessLevel})
刃口半径: ${edgeRadius.toFixed(2)} μm
预估耐用度: ${durability.toLocaleString()} 次切割

研磨检查步骤
------------
1. [ ] 准备磨石（粗磨400#、中磨1000#、细磨3000#、抛光8000#）
2. [ ] 浸泡磨石至气泡停止冒出
3. [ ] 标记刃口便于观察研磨进度
4. [ ] 设定研磨角度 ${angle}°，使用角度导板辅助
5. [ ] 粗磨：400# 磨石，每侧约20次，直到出现毛刺
6. [ ] 中磨：1000# 磨石，每侧约15次，减小毛刺
7. [ ] 细磨：3000# 磨石，每侧约10次
8. [ ] 抛光：8000# 磨石，每侧约5次
9. [ ] 去毛刺：使用牛皮或荡刀板
10. [ ] 测试锋利度：切割纸张或测试切割力

注意事项
--------
- 保持角度一致性是获得锋利刃口的关键
- 每次研磨后注意去毛刺处理
- 钢材硬度越高，研磨难度越大但保持性越好
- 建议定期检查刃口状态，及时维护
`.trim();

    if (comparisonList.length > 0) {
        let bestSharpness = Infinity;
        let bestDurability = -Infinity;
        let bestSharpnessIdx = -1;
        let bestDurabilityIdx = -1;

        comparisonList.forEach((item, idx) => {
            if (item.sharpness < bestSharpness) {
                bestSharpness = item.sharpness;
                bestSharpnessIdx = idx;
            }
            if (item.durability > bestDurability) {
                bestDurability = item.durability;
                bestDurabilityIdx = idx;
            }
        });

        checklist += `

研磨方案对比
============
共 ${comparisonList.length} 个方案对比

`;

        const schemeLabels = ['方案A', '方案B', '方案C'];
        comparisonList.forEach((item, idx) => {
            const label = schemeLabels[idx] || `方案${idx + 1}`;
            const typeName = KNIFE_TYPES[item.knifeType]?.name || item.knifeType;
            let markers = [];
            if (idx === bestSharpnessIdx) markers.push('★最锋利');
            if (idx === bestDurabilityIdx) markers.push('★最耐用');
            const markerStr = markers.length > 0 ? ` (${markers.join(', ')})` : '';

            checklist += `${label}: ${item.knifeName} (${typeName})${markerStr}
`;
        });

        checklist += `
--------------------------------------------------------------------------------
指标                  ${comparisonList.map((_, idx) => schemeLabels[idx] || `方案${idx + 1}`).join('        ')}
--------------------------------------------------------------------------------
研磨角度              ${comparisonList.map(item => `${item.angle.toFixed(1)}°`.padEnd(8)).join('        ')}
钢材硬度              ${comparisonList.map(item => `HRC${item.hardness.toFixed(0)}`.padEnd(8)).join('        ')}
刃口厚度              ${comparisonList.map(item => `${item.edgeThickness.toFixed(0)}μm`.padEnd(8)).join('        ')}
刀身厚度              ${comparisonList.map(item => `${item.stock.toFixed(1)}mm`.padEnd(8)).join('        ')}
材料去除量            ${comparisonList.map(item => `${item.materialRemoval.toFixed(4)}`.padEnd(8)).join('        ')}
理论锋利度            ${comparisonList.map((item, idx) => `${item.sharpness.toFixed(1)}N${idx === bestSharpnessIdx ? '*' : ''}`.padEnd(8)).join('        ')}
刃口半径              ${comparisonList.map(item => `${item.edgeRadius.toFixed(2)}μm`.padEnd(8)).join('        ')}
耐用度                ${comparisonList.map((item, idx) => `${item.durability.toLocaleString()}${idx === bestDurabilityIdx ? '*' : ''}`.padEnd(8)).join('        ')}
--------------------------------------------------------------------------------

说明:
- ★最锋利: 理论锋利度数值最小，切割力最低
- ★最耐用: 耐用度预估切割次数最多
- * 标记表示该指标在对比方案中最优
`;
    }
    
    const blob = new Blob([checklist], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${knifeName}_研磨检查清单.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function printReferenceCard() {
    const printDate = document.getElementById('printDate');
    const printTableBody = document.getElementById('printTableBody');
    
    printDate.textContent = `生成时间: ${new Date().toLocaleString()}`;
    
    const currentType = document.getElementById('knifeType').value;
    const currentAngle = parseFloat(document.getElementById('grindAngle').value);
    const currentHardness = parseFloat(document.getElementById('steelHardness').value);
    const currentThickness = parseFloat(document.getElementById('edgeThickness').value);
    const currentSharpness = calculateTheoreticalSharpness(currentAngle, currentThickness, currentHardness);
    
    let currentSharpnessLevel;
    if (currentSharpness < SHARPNESS_THRESHOLDS.excellent) currentSharpnessLevel = '极佳';
    else if (currentSharpness < SHARPNESS_THRESHOLDS.good) currentSharpnessLevel = '良好';
    else if (currentSharpness < SHARPNESS_THRESHOLDS.fair) currentSharpnessLevel = '一般';
    else currentSharpnessLevel = '需研磨';
    
    let rows = '';
    
    rows += `
        <tr style="background: #e3f2fd; font-weight: 600;">
            <td>★ 当前设置</td>
            <td>${currentAngle}°</td>
            <td>${KNIFE_TYPES[currentType].useCase}</td>
            <td>${currentSharpnessLevel} (${currentSharpness.toFixed(1)}N)</td>
        </tr>
    `;
    
    Object.entries(KNIFE_TYPES).forEach(([key, config]) => {
        if (key === 'custom') return;
        
        const avgAngle = (config.minAngle + config.maxAngle) / 2;
        const refSharpness = calculateTheoreticalSharpness(avgAngle, 30, 58);
        
        let level;
        if (refSharpness < SHARPNESS_THRESHOLDS.excellent) level = '极佳';
        else if (refSharpness < SHARPNESS_THRESHOLDS.good) level = '良好';
        else if (refSharpness < SHARPNESS_THRESHOLDS.fair) level = '一般';
        else level = '需研磨';
        
        rows += `
            <tr>
                <td>${config.name}</td>
                <td>${config.minAngle}° - ${config.maxAngle}°</td>
                <td>${config.useCase}</td>
                <td>${level}</td>
            </tr>
        `;
    });
    
    printTableBody.innerHTML = rows;
    
    setTimeout(() => window.print(), 100);
}

document.addEventListener('DOMContentLoaded', init);
