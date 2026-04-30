# Nano Banana Local Editor

로컬에서 실행하는 선택 영역 이미지 변형 도구입니다. Electron 데스크톱 창에서 이미지를 열고 변형할 부분을 칠하면, 앱이 Vertex AI Gemini 이미지 편집 API를 호출합니다.

## 실행

가장 쉬운 실행:

1. 저장소 루트의 `NanoBananaEditor.cmd`를 더블클릭합니다.
2. 앱 화면의 `Vertex 서비스 계정` 영역에 JSON 파일을 선택하거나 JSON 내용을 붙여넣습니다.
3. 이미지를 열고, 오른쪽 큐에서 이미지를 선택해 각각 변형할 부분을 칠하거나 `전체 선택`을 누릅니다.
4. `대기 이미지 모두 변형`을 누르면 영역이 선택된 이미지들을 동시에 요청합니다.

터미널 실행:

```powershell
npm run nanobanana:app
```

브라우저 방식이 필요하면 `npm run nanobanana:local`도 남겨두었습니다.

## Vertex JSON

서비스 계정 JSON은 실행 단계에서 화면에 넣습니다. JSON 안의 `project_id`가 있으면 프로젝트 ID 입력은 비워도 됩니다.

환경변수는 선택 사항입니다.

- `GOOGLE_CLOUD_LOCATION`: Vertex AI location. 기본값 `us-central1`
- `GEMINI_IMAGE_MODEL`: 기본 모델. 기본값 `gemini-3.1-flash-image-preview`
- `PORT`: 브라우저 방식 포트. 기본값 `8789`

## 동작 방식

1. 원본 이미지를 브라우저에서 최대 1600px로 축소합니다.
2. 이미지마다 선택 영역을 PNG 마스크로 따로 저장합니다.
3. 원본, 마스크, 프롬프트, 화면에 넣은 Vertex JSON으로 Vertex AI Gemini 이미지 모델에 보냅니다.
4. 모델 결과에서 선택 영역만 원본 위에 다시 합성해 선택 밖 영역을 유지합니다.
5. 요청 시작 시 작업 기록을 앱 데이터 `history` 폴더에 저장하고, 성공 시 `result.png`를 자동 저장합니다.
6. 목록에서 이미지를 삭제해도 원본 파일과 작업 기록은 삭제하지 않고, 현재 목록에서만 제거합니다.

참고: `gemini-3.1-flash-image-preview`는 Vertex AI 문서의 Gemini 이미지 편집 지원 모델입니다.
