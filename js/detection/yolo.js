export function parseYoloClassNames(metadataText) {
    const names = [];
    let insideNamesBlock = false;

    metadataText.split('\n').forEach(line => {
        if (/^names:\s*$/.test(line)) {
            insideNamesBlock = true;
            return;
        }

        if (!insideNamesBlock) return;
        if (/^\S/.test(line)) {
            insideNamesBlock = false;
            return;
        }

        const match = line.match(/^\s*(\d+):\s*['"]?([^'"]+)['"]?\s*$/);
        if (match) names[Number(match[1])] = match[2].trim();
    });

    return names;
}

export async function loadYoloModelAssets({
    tf,
    metadataUrl = './model_web/metadata.yaml',
    modelUrl = './model_web/model.json'
}) {
    if (!tf) {
        throw new Error('TensorFlow.js 尚未載入');
    }

    await tf.setBackend('webgl');
    await tf.ready();

    const metadataText = await fetch(metadataUrl, { cache: 'no-store' })
        .then(res => res.ok ? res.text() : '');
    const classNames = parseYoloClassNames(metadataText);

    if (classNames[0] !== 'id_card') {
        throw new Error(`model_web 不是證件模型，class 0 = ${classNames[0] || 'unknown'}`);
    }

    const model = await tf.loadGraphModel(modelUrl);
    return { model, classNames };
}
