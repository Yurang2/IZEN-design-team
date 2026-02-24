import type { ProjectRecord, ProjectSort, ProjectTimelineRow } from '../../shared/types'
import { EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ProjectsViewProps = {
  sortedProjectDbOptions: ProjectRecord[]
  projectSort: ProjectSort
  projectTimelineProjectId: string
  projectTimelineRows: ProjectTimelineRow[]
  selectedTimelineProject: ProjectRecord | null
  projectTimelineRange: {
    start: Date
    end: Date
    totalDays: number
  }
  loadingProjects: boolean
  onProjectSortChange: (nextSort: ProjectSort) => void
  onProjectTimelineProjectIdChange: (projectId: string) => void
  onTaskOpen: (taskId: string) => void
  toProjectLabel: (project: ProjectRecord) => string
  formatDateLabel: (value: string) => string
  toIsoDate: (value: Date) => string
  toNotionUrlById: (id: string | undefined) => string | null
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

function ProjectsSkeleton() {
  return (
    <>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>프로젝트</th>
              <th>행사일</th>
              <th>Notion</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, idx) => (
              <tr key={`projects-skeleton-row-${idx}`}>
                <td>
                  <Skeleton width="220px" height="16px" />
                </td>
                <td>
                  <Skeleton width="160px" height="16px" />
                </td>
                <td>
                  <Skeleton width="56px" height="16px" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <section className="projectTimelineSection" aria-hidden="true">
        <header className="projectTimelineHeader">
          <h3>종속 업무 타임라인</h3>
          <Skeleton width="24px" height="16px" />
        </header>
        <div className="projectTimelineList">
          {Array.from({ length: 4 }).map((_, idx) => (
            <article key={`timeline-skeleton-${idx}`} className="projectTimelineRow">
              <div className="projectTimelineTask">
                <Skeleton width="60%" height="15px" />
                <Skeleton width="72%" height="12px" />
              </div>
              <div className="projectTimelineTrack">
                <Skeleton width="100%" height="12px" />
              </div>
              <div className="projectTimelineDates">
                <Skeleton width="84px" height="12px" />
                <span>~</span>
                <Skeleton width="84px" height="12px" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

export function ProjectsView({
  sortedProjectDbOptions,
  projectSort,
  projectTimelineProjectId,
  projectTimelineRows,
  selectedTimelineProject,
  projectTimelineRange,
  loadingProjects,
  onProjectSortChange,
  onProjectTimelineProjectIdChange,
  onTaskOpen,
  toProjectLabel,
  formatDateLabel,
  toIsoDate,
  toNotionUrlById,
  joinOrDash,
  toStatusTone,
}: ProjectsViewProps) {
  return (
    <section className="projectSection">
      <header className="projectHeader">
        <h2>프로젝트 목록</h2>
        <span>{sortedProjectDbOptions.length}건</span>
      </header>
      <section className="filters compact">
        <label>
          정렬
          <select value={projectSort} onChange={(event) => onProjectSortChange(event.target.value as ProjectSort)}>
            <option value="name_asc">이름 오름차순</option>
            <option value="name_desc">이름 내림차순</option>
            <option value="date_asc">행사일 빠른순</option>
            <option value="date_desc">행사일 늦은순</option>
          </select>
        </label>
        <label>
          종속 업무 타임라인 대상
          <select value={projectTimelineProjectId} onChange={(event) => onProjectTimelineProjectIdChange(event.target.value)}>
            {sortedProjectDbOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {toProjectLabel(project)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loadingProjects ? (
        <ProjectsSkeleton />
      ) : (
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>프로젝트</th>
                  <th>행사일</th>
                  <th>Notion</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjectDbOptions.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <span className="projectTitle">
                        {project.coverUrl ? <img className="projectCoverImage" src={project.coverUrl} alt="" /> : null}
                        {project.iconUrl ? <img className="projectIconImage" src={project.iconUrl} alt="" /> : null}
                        {project.iconEmoji ? <span className="projectIconEmoji">{project.iconEmoji}</span> : null}
                        <span>{project.name}</span>
                      </span>
                    </td>
                    <td>{project.eventDate ? `${formatDateLabel(project.eventDate)} (${project.eventDate})` : '-'}</td>
                    <td>
                      {toNotionUrlById(project.id) ? (
                        <a className="linkButton secondary mini" href={toNotionUrlById(project.id) ?? undefined} target="_blank" rel="noreferrer">
                          열기
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <section className="projectTimelineSection">
            <header className="projectTimelineHeader">
              <h3>종속 업무 타임라인</h3>
              <span>{projectTimelineRows.length}건</span>
            </header>

            {selectedTimelineProject ? (
              <p className="muted small">
                대상 프로젝트: {toProjectLabel(selectedTimelineProject)} · 범위: {formatDateLabel(toIsoDate(projectTimelineRange.start))} ~{' '}
                {formatDateLabel(toIsoDate(projectTimelineRange.end))}
              </p>
            ) : null}

            {projectTimelineRows.length === 0 ? (
              <EmptyState message="선택한 프로젝트에 귀속된 업무가 없습니다." />
            ) : (
              <div className="projectTimelineList">
                {projectTimelineRows.map(({ task, barStyle }) => (
                  <article key={task.id} className="projectTimelineRow">
                    <div className="projectTimelineTask">
                      <button type="button" className="taskLink" onClick={() => onTaskOpen(task.id)}>
                        {task.taskName}
                      </button>
                      <span className="projectTimelineMeta">
                        {task.projectName} · 담당: {joinOrDash(task.assignee)} · 상태: {task.status || '-'}
                      </span>
                    </div>

                    <div className="projectTimelineTrack">
                      <div className={`projectTimelineBar tone-${toStatusTone(task.status)}`} style={barStyle} />
                    </div>

                    <div className="projectTimelineDates">
                      <span>{task.startDate || '-'}</span>
                      <span>~</span>
                      <span>{task.dueDate || '-'}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}
