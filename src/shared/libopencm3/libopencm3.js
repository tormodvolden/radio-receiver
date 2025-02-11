var File = require("qbs.File");
var FileInfo = require("qbs.FileInfo");
var TextFile = require("qbs.TextFile");
var Utilities = require("qbs.Utilities");

function sourcesPath(project) {
    return FileInfo.joinPaths(project.sourceDirectory, "src/shared/libopencm3/content")
}

function submoduleExists(project) {
    var path = sourcesPath(project);
    return File.exists(FileInfo.joinPaths(path, "Makefile"))
}

function targetSubPath(targetMcu) {
    if (targetMcu === "stm32f0")
        return "stm32/f0";
    else if (targetMcu === "stm32f1")
        return "stm32/f1";
}

function targetDefine(targetMcu) {
    if (targetMcu === "stm32f0")
        return "STM32F0";
    else if (targetMcu === "stm32f1")
        return "STM32F1";
}

function libopencm3SubPath(targetMcu) {
    return FileInfo.joinPaths("libopencm3", targetSubPath(targetMcu));
}

function libopencmsisSubPath(targetMcu) {
    return FileInfo.joinPaths("libopencmsis", targetSubPath(targetMcu));
}

function findJsonFile(project) {
    var cm3SubPath = libopencm3SubPath(project.targetMcu);
    if (project.targetMcu === "stm32f0")
        return FileInfo.joinPaths(project.libopencm3SourcesPath, "include", cm3SubPath, "irq.json");
    else if (project.targetMcu === "stm32f1")
        return FileInfo.joinPaths(project.libopencm3SourcesPath, "include", cm3SubPath, "irq.json");
}

function nvicGeneratorOutputArtifacts(project, product) {
    console.error("GP: " + product.generatedPath)
    var cm3SubPath = libopencm3SubPath(project.targetMcu);
    var cmsisSubPath = libopencmsisSubPath(project.targetMcu);
    return [{
                fileTags: ["hpp", "nvic_hpp"],
                filePath: FileInfo.joinPaths(product.generatedPath, cm3SubPath, "nvic.h"),
            },
            {
                fileTags: ["hpp", "cmsis_hpp"],
                filePath: FileInfo.joinPaths(product.generatedPath, cmsisSubPath, "irqhandlers.h"),
            },
            {
                fileTags: ["hpp", "nvic_cpp"],
                filePath: FileInfo.joinPaths(product.generatedPath, "libopencm3/stm32/f1/vector_nvic.c")
            }];
}

function generateNvicHeader(project, product, inputs, outputs, input, output, data) {
    var cmd = new JavaScriptCommand();
    cmd.sourcesRoot = project.libopencm3SourcesPath;
    cmd.data = data;
    cmd.inputFile = input.filePath;
    cmd.outputFile = outputs.nvic_hpp[0].filePath;
    cmd.description = "generating " + outputs.nvic_hpp[0].fileName + " from "
            + FileInfo.relativePath(project.libopencm3SourcesPath, input.filePath);
    cmd.sourceCode = function() {
        var irqs = data["irqs"] || [];

        var tf = new TextFile(outputFile, TextFile.WriteOnly);
        tf.writeLine("// This file is part of the libopencm3 project.");
        tf.writeLine("// It was generated by the Qbs from "
                     + FileInfo.relativePath(sourcesRoot, inputFile));
        tf.writeLine("");
        tf.writeLine("#ifndef " + data["includeguard"]);
        tf.writeLine("#define " + data["includeguard"]);
        tf.writeLine("");
        tf.writeLine("#include <libopencm3/cm3/nvic.h>");
        tf.writeLine("");

        for (var i = 0; i < irqs.length; ++i)
            tf.writeLine("#define NVIC_" + irqs[i].toUpperCase() + "_IRQ " + i);

        tf.writeLine("");
        tf.writeLine("#define NVIC_IRQ_COUNT " + irqs.length);
        tf.writeLine("");
        tf.writeLine("BEGIN_DECLS");
        tf.writeLine("");

        for (var j = 0; j < irqs.length; ++j)
            tf.writeLine("void " + irqs[j].toLowerCase() + "_isr(void);");

        tf.writeLine("");
        tf.writeLine("END_DECLS");
        tf.writeLine("");
        tf.writeLine("#endif // " + data["includeguard"]);
    };
    return cmd;
}

function generateCmsisHeader(project, product, inputs, outputs, input, output, data) {
    var cmd = new JavaScriptCommand();
    cmd.sourcesRoot = project.libopencm3SourcesPath;
    cmd.data = data;
    cmd.inputFile = input.filePath;
    cmd.outputFile = outputs.cmsis_hpp[0].filePath;
    cmd.description = "generating " + outputs.cmsis_hpp[0].fileName + " from "
            + FileInfo.relativePath(project.libopencm3SourcesPath, input.filePath);
    cmd.sourceCode = function() {
        var irqs = data["irqs"] || [];

        var tf = new TextFile(outputFile, TextFile.WriteOnly);
        tf.writeLine("// This file is part of the libopencm3 project.");
        tf.writeLine("// It was generated by the Qbs from "
                     + FileInfo.relativePath(sourcesRoot, inputFile));
        tf.writeLine("");
        tf.writeLine("// These definitions bend every interrupt handler that is defined CMSIS style");
        tf.writeLine("// to the weak symbol exported by libopencm3.")
        tf.writeLine("");

        for (var i = 0; i < irqs.length; ++i)
            tf.writeLine("#define " + irqs[i].toUpperCase() + "_IRQHandler " + irqs[i].toLowerCase() + "_isr");
    };
    return cmd;
}

function generateNvicVector(project, product, inputs, outputs, input, output, data) {
    var cmd = new JavaScriptCommand();
    cmd.sourcesRoot = project.libopencm3SourcesPath;
    cmd.data = data;
    cmd.inputFile = input.filePath;
    cmd.outputFile = outputs.nvic_cpp[0].filePath;
    cmd.description = "generating " + outputs.nvic_cpp[0].fileName + " from "
            + FileInfo.relativePath(project.libopencm3SourcesPath, input.filePath);
    cmd.sourceCode = function() {
        var irqs = data["irqs"] || [];

        var tf = new TextFile(outputFile, TextFile.WriteOnly);
        tf.writeLine("// This file is part of the libopencm3 project.");
        tf.writeLine("// It was generated by the Qbs from "
                     + FileInfo.relativePath(sourcesRoot, inputFile));
        tf.writeLine("");
        tf.writeLine("// This part needs to get included in the compilation unit where");
        tf.writeLine("// blocking_handler gets defined due to the way #pragma works.")
        tf.writeLine("");

        for (var i = 0; i < irqs.length; ++i)
            tf.writeLine("void " + irqs[i].toLowerCase() + "_isr(void) __attribute__((weak, alias(\"blocking_handler\")));");

        tf.writeLine("");
        tf.writeLine("// Initialization template for the interrupt vector table. This definition is");
        tf.writeLine("// used by the startup code generator (vector.c) to set the initial values for");
        tf.writeLine("// the interrupt handling routines to the chip family specific _isr weak");
        tf.writeLine("// symbols.");
        tf.writeLine("");

        var defines = irqs.map(function(irq) {
            return "[NVIC_" + irq.toUpperCase() + "_IRQ] = " + irq.toLowerCase() + "_isr";
        });

        tf.writeLine("#define IRQ_HANDLERS \\\n    " + defines.join(", \\\n    "));
    };
    return cmd;
}

function prepareNvicGenerator(project, product, inputs, outputs, input, output) {
    var cmds = [];
    var tf = new TextFile(input.filePath, TextFile.ReadOnly);
    var content = tf.readAll();
    var data = JSON.parse(content);

    cmds.push(generateNvicHeader(project, product, inputs, outputs, input, output, data));
    cmds.push(generateCmsisHeader(project, product, inputs, outputs, input, output, data));
    cmds.push(generateNvicVector(project, product, inputs, outputs, input, output, data));
    return cmds;
}
