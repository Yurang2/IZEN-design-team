# Nano Banana Local Editor

로컬에서 실행하는 선택 영역 이미지 변형 도구입니다. 브라우저 UI에서 이미지를 열고 변형할 부분을 칠하면, 로컬 Node 서버가 Vertex AI Gemini 이미지 편집 API를 호출합니다.

## 실행

PowerShell 예시:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
$env:GOOGLE_CLOUD_PROJECT_ID="your-google-cloud-project"
$env:GOOGLE_CLOUD_LOCATION="us-central1"
npm run nanobanana:local
```

브라우저에서 `http://127.0.0.1:8789`를 엽니다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | 서비스 계정 JSON 파일 경로 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 서비스 계정 JSON 문자열. 파일 대신 사용 가능 |
| `GOOGLE_CLOUD_PROJECT_ID` | Google Cloud 프로젝트 ID. JSON의 `project_id`가 있으면 생략 가능 |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI location. 기본값 `us-central1` |
| `GEMINI_IMAGE_MODEL` | 기본 모델. 기본값 `gemini-3.1-flash-image-preview` |
| `PORT` | 로컬 포트. 기본값 `8789` |

## 동작 방식

1. 원본 이미지를 브라우저에서 최대 1600px로 축소합니다.
2. 선택 영역을 PNG 마스크로 만듭니다.
3. 원본, 마스크, 프롬프트를 Vertex AI Gemini 이미지 모델에 보냅니다.
4. 모델 결과에서 선택 영역만 원본 위에 다시 합성해 선택 밖 영역을 유지합니다.

참고: `gemini-3.1-flash-image-preview`는 Vertex AI 문서의 Gemini 이미지 편집 지원 모델입니다.
