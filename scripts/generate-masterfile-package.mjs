import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_OUTPUT = 'files/2026 IZEN Seminar in Bangkok Masterfile'
const DEFAULT_SOURCE = 'files/IZEN Seminar in Bangkok Timetable.xlsx'

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    source: DEFAULT_SOURCE,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--output') options.output = argv[index + 1] ?? options.output
    if (value === '--source') options.source = argv[index + 1] ?? options.source
  }

  return options
}

async function recreateDirectory(rootDirectory) {
  await fs.rm(rootDirectory, { recursive: true, force: true })
  await fs.mkdir(rootDirectory, { recursive: true })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sourceDirectory = path.join(options.output, '01_Source')
  const filesDirectory = path.join(options.output, '02_Files')

  await recreateDirectory(options.output)
  await fs.mkdir(sourceDirectory, { recursive: true })
  await fs.mkdir(filesDirectory, { recursive: true })

  const rootReadme = [
    `Package Root: ${path.basename(options.output)}`,
    'Structure',
    '- 00_README.txt',
    '- 01_Source',
    '- 02_Files',
    '',
    'Rules',
    '- Put all delivery assets in 02_Files.',
    '- Use Q-number prefix for cue-specific file names.',
    '- Repeated assets may omit Q-number and use a generic file name.',
    '- Do not use Start / Then suffixes in final file names.',
    '',
  ].join('\n')

  const sourceReadme = [
    'Source Reference',
    `- Workbook: ${options.source}`,
    '',
  ].join('\n')

  const filesReadme = [
    'Delivery Assets',
    '- One flat folder for all final media files.',
    '- Cue-specific example: I_Q04_Lecture_1.png, V_Q02_Opening_Cinematic.mp4',
    '- Repeated asset example: I_Certification.jpg, V_IZEN_Seminar_Showroom_1008x432.mp4',
    '',
  ].join('\n')

  await fs.writeFile(path.join(options.output, '00_README.txt'), `${rootReadme}\n`, 'utf8')
  await fs.writeFile(path.join(sourceDirectory, 'README.txt'), `${sourceReadme}\n`, 'utf8')
  await fs.writeFile(path.join(filesDirectory, 'README.txt'), `${filesReadme}\n`, 'utf8')

  console.log(`Created masterfile package structure in ${options.output}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
