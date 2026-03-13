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
  const sharedDirectory = path.join(options.output, '02_Shared')
  const cueFilesDirectory = path.join(options.output, '03_Q_Files')

  await recreateDirectory(options.output)
  await fs.mkdir(sourceDirectory, { recursive: true })
  await fs.mkdir(sharedDirectory, { recursive: true })
  await fs.mkdir(cueFilesDirectory, { recursive: true })

  const rootReadme = [
    `Package Root: ${path.basename(options.output)}`,
    'Structure',
    '- 00_README.txt',
    '- 01_Source',
    '- 02_Shared',
    '- 03_Q_Files',
    '',
    'Rules',
    '- Put repeated assets in 02_Shared.',
    '- Put cue-specific assets in 03_Q_Files.',
    '- Use Q-number prefix for cue-specific file names.',
    '- Do not use Start / Then suffixes in final file names.',
    '',
  ].join('\n')

  const sourceReadme = [
    'Source Reference',
    `- Workbook: ${options.source}`,
    '',
  ].join('\n')

  const sharedReadme = [
    'Shared Assets',
    '- Repeated audio, image, and video files live here.',
    '- Example: Entrance Audio, Certification graphic, Certi Audio.',
    '',
  ].join('\n')

  const cueFilesReadme = [
    'Cue-specific Assets',
    '- One flat folder for cue-specific files.',
    '- Example: I_Q03_Lecture_1.png, V_Q02_Opening_Cinematic.mp4',
    '',
  ].join('\n')

  await fs.writeFile(path.join(options.output, '00_README.txt'), `${rootReadme}\n`, 'utf8')
  await fs.writeFile(path.join(sourceDirectory, 'README.txt'), `${sourceReadme}\n`, 'utf8')
  await fs.writeFile(path.join(sharedDirectory, 'README.txt'), `${sharedReadme}\n`, 'utf8')
  await fs.writeFile(path.join(cueFilesDirectory, 'README.txt'), `${cueFilesReadme}\n`, 'utf8')

  console.log(`Created masterfile package structure in ${options.output}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
