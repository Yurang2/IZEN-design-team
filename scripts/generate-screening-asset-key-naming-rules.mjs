import * as XLSX from 'xlsx'
import path from 'node:path'

const workbook = XLSX.utils.book_new()

workbook.Props = {
  Title: 'Asset Key Naming Rules',
  Subject: 'Screening asset key naming rules for events and exhibitions',
  Author: 'OpenAI Codex',
  Company: 'IZEN',
}

const rules = [
  ['항목', '규칙', '비고'],
  ['목적', '같은 영상을 행사, 전시, 준비, 기록, 이슈 DB에서 같은 키로 추적하기 위한 기준값', '파일 링크와 별개로 관리'],
  ['기본 원칙', '업로드 파일명은 반드시 asset_key로 시작한다', '예: bkk2026_expo_idle_loop_main_r01_master.mp4'],
  ['asset_key 형식', '[project]_[mode]_[scene]_[content]_[screen]', '소문자 + 숫자 + 언더스코어만 사용'],
  ['project', '프로젝트 또는 행사 단축코드', '예: bkk2026, ids2026, ktx2026'],
  ['mode', 'event | expo', '행사면 event, 전시면 expo'],
  ['scene', '운영 상태 또는 상황명', '예: opening, idle, prestart, seminar, closing'],
  ['content', '콘텐츠 성격', '예: intro, loop, promo, product, speaker_ppt'],
  ['screen', '출력 구역', 'main | hang | both'],
  ['파일명 형식', '[asset_key]_r[rev]_[variant].[ext]', '예: bkk2026_event_opening_intro_main_r03_master.mp4'],
  ['rev 형식', 'r01, r02, r03 ... 두 자리 고정', '원본 자체 수정이 있을 때만 증가'],
  ['variant 형식', 'master | resize233 | resize169 | resize11 | crop | mute | textfix | p01', '행사별 가공은 variant에서 표현'],
  ['Resize 해석', 'Resize는 variant로 관리하고 rev를 올리지 않는다', '예: 같은 원본 r03에서 resize233 파생본 생성'],
  ['보완 이슈 해석', '원본 수정이 필요할 때만 rev를 올린다', '예: 자막 오류 수정 후 r04'],
  ['금지 1', '한글, 공백, 괄호, 하이픈 혼용 금지', '예: Bangkok Opening FINAL (1).mp4 금지'],
  ['금지 2', 'v3, final, final_final 같은 임의 표현 금지', 'rev와 variant를 표준 형식으로만 사용'],
  ['링크 정책', '파일 링크는 권장이지만 필수는 아니다', '링크가 없으면 저장 위치 텍스트는 반드시 기록'],
  ['업로드 원칙', '실제 업로드 파일명 자체를 표준 네이밍으로 맞춘다', '나중에 사람이 봐도 추적 가능해야 함'],
]

const examples = [
  ['운영유형', '상황', 'asset_key', '권장 파일명', '해설'],
  ['행사', '오프닝', 'bkk2026_event_opening_intro_main', 'bkk2026_event_opening_intro_main_r03_master.mp4', '행사 오프닝 메인 스크린용 원본'],
  ['행사', 'CEO 소개', 'bkk2026_event_intro_product_main', 'bkk2026_event_intro_product_main_r02_master.mp4', '제품 또는 비즈니스 소개용 메인 영상'],
  ['행사', 'Speaker PPT', 'bkk2026_event_seminar_speaker_ppt_main', 'bkk2026_event_seminar_speaker_ppt_main_r01_master.pptx', 'PPT도 같은 규칙 사용 가능'],
  ['전시', '평시 루프 메인', 'bkk2026_expo_idle_loop_main', 'bkk2026_expo_idle_loop_main_r03_master.mp4', '전시 평시 루프 메인 LED'],
  ['전시', '평시 루프 행잉', 'bkk2026_expo_idle_loop_hang', 'bkk2026_expo_idle_loop_hang_r03_resize11.mp4', '같은 원본을 행잉용 비율로 파생'],
  ['전시', '세미나 시작 전', 'bkk2026_expo_prestart_notice_both', 'bkk2026_expo_prestart_notice_both_r01_master.mp4', '메인과 행잉 공용 사용 가능'],
  ['전시', '평시 루프 playlist 1', 'bkk2026_expo_idle_loop_main', 'bkk2026_expo_idle_loop_main_r03_p01.mp4', '같은 상태, 같은 세트의 1번 파일'],
  ['전시', '평시 루프 playlist 20', 'bkk2026_expo_idle_loop_main', 'bkk2026_expo_idle_loop_main_r03_p20.mp4', '같은 상태, 같은 세트의 20번 파일'],
  ['행사', '원본 오류 수정 후', 'bkk2026_event_opening_intro_main', 'bkk2026_event_opening_intro_main_r04_master.mp4', '자막, 색보정 등 원본 수정으로 rev 증가'],
  ['행사', '비율 변형만 필요', 'bkk2026_event_opening_intro_main', 'bkk2026_event_opening_intro_main_r04_resize233.mp4', 'r04 원본에서 2.33:1 파생본 생성'],
]

const checklist = [
  ['체크항목', '기준', '설명'],
  ['프로젝트 코드가 정해져 있는가?', '예: bkk2026', '행사 시작 전에 프로젝트 단축코드 먼저 합의'],
  ['mode가 event 또는 expo 중 하나인가?', 'event 또는 expo만 사용', '전시를 exhibition, expo 혼용하지 않음'],
  ['scene이 운영 상태를 설명하는가?', 'opening, idle, prestart, seminar, closing', '사람마다 다른 표현 금지'],
  ['content가 실제 콘텐츠 의미를 설명하는가?', 'intro, loop, promo, product, speaker_ppt', 'ambiguous한 movie, clip 지양'],
  ['screen이 main, hang, both 중 하나인가?', 'main | hang | both', 'zone1, zone2는 예외 케이스 때만 추가 합의'],
  ['rev가 두 자리 형식인가?', 'r01, r02 ...', 'v1, ver2 사용 금지'],
  ['variant가 필요할 때만 붙었는가?', 'master, resize233, p01 등', '원본이면 master 권장'],
  ['파일명 전체가 소문자, 숫자, 언더스코어만 쓰는가?', 'yes', '공백, 한글, 괄호 금지'],
  ['파일 링크가 없으면 저장 위치를 텍스트로 남겼는가?', '필수', 'Drive, NAS 경로라도 기록'],
  ['Resize 요구인지, 원본 보완 이슈인지 구분했는가?', 'Resize = variant / 원본수정 = rev 증가', '이 기준을 반드시 팀 공통으로 사용'],
]

const discussion = [
  ['논의주제', '제안안', '결정 예시', '비고'],
  ['프로젝트 코드 규칙', '연도 + 행사약어 사용', 'bkk2026', '한 번 정하면 전 DB 공통 사용'],
  ['전시 상태명 scene 목록', 'idle, prestart, seminar, break, closing', '', '팀이 자주 쓰는 표현만 허용 목록으로 확정'],
  ['content 허용 목록', 'intro, loop, promo, product, speaker_ppt, certi', '', '유사어 남발 방지'],
  ['screen 허용 목록', 'main, hang, both', '', '추가 존이 필요하면 별도 합의'],
  ['variant 허용 목록', 'master, resize233, resize169, resize11, crop, mute, textfix, p01 ~ p99', '', '행사별 가공 표현 통일'],
  ['링크 정책', '링크 권장 + 링크 없으면 저장 위치 텍스트 필수', '', 'DB 밖 파일이어도 추적 가능해야 함'],
  ['업로드 시점 규칙', '업로드 전에 파일명을 표준 네이밍으로 변경 후 업로드', '', '나중에 일괄 정리 비용 절감'],
]

function appendSheet(name, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = widths.map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(workbook, sheet, name)
}

appendSheet('규칙 요약', rules, [18, 56, 42])
appendSheet('네이밍 예시', examples, [12, 18, 40, 56, 36])
appendSheet('업로드 체크', checklist, [28, 24, 44])
appendSheet('논의 포인트', discussion, [24, 52, 20, 36])

const outputPath = path.resolve('files', 'screening-asset-key-naming-rules.xlsx')
XLSX.writeFile(workbook, outputPath)
console.log(outputPath)
