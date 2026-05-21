export function createAppState() {
    return {
        currentFile: null,
        currentImageObjectUrl: null,
        sourceImageInfo: null,
        imageQualityIssues: [],
        pdfPages: [],
        draggedPdfIndex: null
    };
}
