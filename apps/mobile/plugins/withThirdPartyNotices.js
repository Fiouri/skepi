// Developer Preview: the Android dependencies for the third-party notices (tools/notices). Registers
// `skepiAndroidDependencies`, which writes app/build/skepi/android-dependencies.json: every external
// module of the release runtime classpath with the licences from its POM (or its parent POMs).
// JavaScript packages (also the React Native modules built as Gradle projects) come from pnpm.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// skepi:third-party-notices';
const GRADLE = `
${MARKER}
tasks.register('skepiAndroidDependencies') {
    def outFile = layout.buildDirectory.file('skepi/android-dependencies.json')
    outputs.file(outFile)
    outputs.upToDateWhen { false }
    doLast {
        def pomOf = { String group, String name, String version ->
            try {
                def cfg = project.configurations.detachedConfiguration(project.dependencies.create("\${group}:\${name}:\${version}@pom"))
                cfg.transitive = false
                return new groovy.xml.XmlSlurper().parse(cfg.singleFile)
            } catch (Exception ignored) {
                return null
            }
        }
        def rows = []
        def ids = project.configurations.getByName('releaseRuntimeClasspath').incoming.resolutionResult.allComponents
            .collect { it.id }
            .findAll { it instanceof org.gradle.api.artifacts.component.ModuleComponentIdentifier }
        ids.each { id ->
            def pom = pomOf(id.group, id.module, id.version)
            def licenses = []
            def url = pom?.url?.text() ?: ''
            def current = pom
            for (int depth = 0; depth < 4 && current != null && licenses.isEmpty(); depth++) {
                current.licenses.license.each { licenses << [name: it.name.text().trim(), url: it.url.text().trim()] }
                if (!url) url = current.url.text()
                def p = current.parent
                current = p.artifactId.text() ? pomOf(p.groupId.text(), p.artifactId.text(), p.version.text()) : null
            }
            rows << [group: id.group, name: id.module, version: id.version, url: url, licenses: licenses]
        }
        rows.sort { a, b -> "\${a.group}:\${a.name}" <=> "\${b.group}:\${b.name}" }
        def file = outFile.get().asFile
        file.parentFile.mkdirs()
        file.text = groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(rows))
        println "SKEPI: \${rows.size()} Android dependencies -> \${file}"
    }
}
`;

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += GRADLE;
    return cfg;
  });
