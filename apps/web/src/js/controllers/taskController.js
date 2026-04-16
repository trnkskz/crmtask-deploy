// ============================================================
// controllers/taskController.js
// Görev listesi render, görev modal açma/kaydetme işlemleri
// ============================================================

const TaskController = (() => {
    const TEAM_PULSE_PERIODS = ['daily', 'weekly', 'monthly'];
    const teamPulseUiState = {
        selectedUserKey: '',
        modalPeriod: 'daily',
        selectedMetric: 'open',
        contactedPeriod: 'daily',
        currentPage: 1,
        recordsByKey: {},
    };
    let teamPulseResizeBound = false;
    let teamPulseRequestId = 0;
    let taskSurfaceRefreshTimer = null;

    function getTeamPulsePeriodLabel(period) {
        if (period === 'weekly') return 'Bu Hafta';
        if (period === 'monthly') return 'Bu Ay';
        return 'Bugün';
    }

    function mergeVisibleTasks(taskItems = []) {
        const incoming = Array.isArray(taskItems) ? taskItems.filter((item) => item?.id) : [];
        const nextMap = new Map();
        (Array.isArray(AppState.tasks) ? AppState.tasks : []).forEach((item) => {
            if (item?.id) nextMap.set(item.id, item);
        });
        incoming.forEach((item) => {
            const existing = nextMap.get(item.id) || null;
            if (!existing) {
                nextMap.set(item.id, item);
                return;
            }
            nextMap.set(item.id, {
                ...item,
                // Summary payload should always refresh the list-facing latest log/date.
                logs: Array.isArray(item.logs) ? item.logs : (existing.logs || []),
                offers: Array.isArray(existing.offers) && existing.offers.length > 0 ? existing.offers : (item.offers || existing.offers || []),
                dealDetails: existing.dealDetails || item.dealDetails || null,
                specificContactName: existing.specificContactName || item.specificContactName || '',
                specificContactPhone: existing.specificContactPhone || item.specificContactPhone || '',
                specificContactEmail: existing.specificContactEmail || item.specificContactEmail || '',
                nextCallDate: item.nextCallDate || existing.nextCallDate || '',
            });
        });
        AppState.tasks = Array.from(nextMap.values()).slice(-200);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeLogTimeLabel(value) {
        const raw = String(value || '').trim();
        const match = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
        if (match) return match[1];
        if (raw.includes(':')) return raw.slice(0, 5);
        return raw;
    }

    function stripEditableLogPrefixForPrompt(rawText) {
        const source = String(rawText || '').trim();
        if (!source) return '';
        return source
            .replace(/^((?:<[^>]+>\s*)*\[[^\]]+\](?:\s*<\/[^>]+>)?)\s*/i, '')
            .replace(/^(\[[^\]]+\])\s*/i, '')
            .trim();
    }

    function getTeamPulseDateRanges() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayIndex = todayStart.getDay();
        const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() + mondayOffset);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
            daily: todayStart.getTime(),
            weekly: weekStart.getTime(),
            monthly: monthStart.getTime(),
        };
    }

    function isPulseInteractionLog(log, userName) {
        const text = String(log?.text || '');
        if (String(log?.user || '') !== String(userName || '')) return false;
        if (text.includes('[Geçmiş Kayıt]') || text.includes('[Sistem]') || text.includes('[Devir]') || text.includes('[Klonlanmış Kampanya]')) {
            return false;
        }
        return true;
    }

    function buildTeamPulseEntries(taskList, userName) {
        const entries = [];
        taskList.forEach((task) => {
            const biz = AppState.getBizMap().get(task.businessId) || task;
            const businessLabel = biz.companyName || 'Bilinmeyen İşletme';
            const taskTitle = `${businessLabel}`;
            const lastActivityMs = (task.logs && task.logs.length > 0)
                ? (parseLogDate(task.logs[0].date) || new Date(task.createdAt || 0).getTime())
                : new Date(task.createdAt || 0).getTime();

            const interactionLogs = (task.logs || [])
                .filter((log) => isPulseInteractionLog(log, userName))
                .map((log) => ({
                    dateMs: parseLogDate(log.date) || 0,
                    taskId: task.id,
                    businessId: task.businessId,
                    businessName: businessLabel,
                    city: biz.city || '-',
                    status: task.status,
                    text: log.text || '',
                    dateLabel: log.date || '-',
                    assignee: task.assignee,
                }))
                .filter((item) => item.dateMs > 0);

            entries.push({
                task,
                biz,
                taskId: task.id,
                businessId: task.businessId,
                businessName: businessLabel,
                city: biz.city || '-',
                taskTitle,
                createdMs: new Date(task.createdAt || 0).getTime(),
                lastActivityMs,
                lastActivityLabel: (task.logs && task.logs[0]?.date) || formatDate(task.createdAt),
                interactionLogs,
                isActive: isActiveTask(task.status),
                isPlannedFollowup: task.status === 'followup' && task.nextCallDate,
            });
        });
        return entries;
    }

    function buildTeamPulseMetricsForUser(user, taskList) {
        const ranges = getTeamPulseDateRanges();
        const entries = buildTeamPulseEntries(taskList, user.name);
        const metrics = {};

        TEAM_PULSE_PERIODS.forEach((period) => {
            const rangeStart = ranges[period];
            const contactedMap = new Map();
            entries.forEach((entry) => {
                entry.interactionLogs.forEach((item) => {
                    if (item.dateMs >= rangeStart && !contactedMap.has(item.businessId)) {
                        contactedMap.set(item.businessId, item);
                    }
                });
            });

            const idleItems = entries
                .filter((entry) => entry.isActive && !entry.isPlannedFollowup && entry.lastActivityMs > 0 && entry.lastActivityMs < rangeStart)
                .sort((a, b) => a.lastActivityMs - b.lastActivityMs)
                .map((entry) => ({
                    taskId: entry.taskId,
                    businessName: entry.businessName,
                    city: entry.city,
                    status: entry.task.status,
                    meta: `Son islem ${entry.lastActivityLabel}`,
                }));

            const openedItems = entries
                .filter((entry) => entry.createdMs >= rangeStart && String(entry.task.createdById || '') === String(user.id || ''))
                .sort((a, b) => b.createdMs - a.createdMs)
                .map((entry) => ({
                    taskId: entry.taskId,
                    businessName: entry.businessName,
                    city: entry.city,
                    status: entry.task.status,
                    meta: `Olusturma ${formatDate(entry.task.createdAt).split(' ')[0]}`,
                }));

            const openItems = entries
                .filter((entry) => entry.isActive)
                .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
                .map((entry) => ({
                    taskId: entry.taskId,
                    businessName: entry.businessName,
                    city: entry.city,
                    status: entry.task.status,
                    meta: `Durum ${TASK_STATUS_LABELS[entry.task.status] || entry.task.status || '-'}`,
                }));

            metrics[period] = {
                contacted: {
                    count: contactedMap.size,
                    items: Array.from(contactedMap.values()).map((item) => ({
                        taskId: item.taskId,
                        businessName: item.businessName,
                        city: item.city,
                        status: item.status,
                        meta: item.dateLabel,
                    })),
                },
                idle: {
                    count: idleItems.length,
                    items: idleItems,
                },
                opened: {
                    count: openedItems.length,
                    items: openedItems,
                },
                open: {
                    count: openItems.length,
                    items: openItems,
                },
            };
        });

        return {
            user,
            key: encodeURIComponent(user.name || ''),
            metrics,
            totalOpen: metrics.monthly.open.count,
            totalContacted: metrics.monthly.contacted.count,
            totalIdle: metrics.monthly.idle.count,
        };
    }

    function getTeamPulseMetricConfig(metricKey) {
        const cPeriod = teamPulseUiState.contactedPeriod || 'daily';
        let cLabel = 'Bugün Görüşülen';
        let cEmpty = 'Bugün görüşülen işletme yok.';
        if (cPeriod === 'weekly') {
            cLabel = 'Bu Hafta Görüşülen';
            cEmpty = 'Bu hafta görüşülen işletme yok.';
        } else if (cPeriod === 'monthly') {
            cLabel = 'Bu Ay Görüşülen';
            cEmpty = 'Bu ay görüşülen işletme yok.';
        }

        const configs = {
            open: {
                label: 'Açık',
                tone: 'open',
                period: 'monthly',
                helper: 'Anlık açık görev yükü',
                empty: 'Bu kullanıcıya ait açık görev bulunmuyor.',
                icon: 'A',
            },
            deal: {
                label: 'Deal',
                tone: 'deal',
                period: 'monthly',
                helper: 'Bu ay deal kapanışları',
                empty: 'Bu ay deal kapanışı bulunmuyor.',
                icon: 'D',
            },
            cold: {
                label: 'Cold',
                tone: 'cold',
                period: 'monthly',
                helper: 'Bu ay cold sonuçları',
                empty: 'Bu ay cold sonucu bulunmuyor.',
                icon: 'C',
            },
            contacted: {
                label: cLabel,
                tone: 'contacted',
                period: cPeriod,
                helper: 'Temas edilen işletmeler',
                empty: cEmpty,
                icon: 'G',
            },
            opened: {
                label: 'Aylık Create Task',
                tone: 'opened',
                period: 'monthly',
                helper: 'Bu ay oluşturduğu görevler',
                empty: 'Bu ay oluşturulan görev bulunmuyor.',
                icon: 'T',
            },
        };
        return configs[metricKey] || configs.open;
    }

    function getTeamPulseMetric(record, metricKey) {
        const config = getTeamPulseMetricConfig(metricKey);
        const periodMetrics = record?.metrics?.[config.period] || {};
        const metric = periodMetrics?.[metricKey] || { count: 0, items: [] };
        return {
            ...config,
            count: Number(metric?.count || 0),
            items: Array.isArray(metric?.items) ? metric.items : [],
        };
    }

    function buildTeamPulseSummaryHtml(record) {
        const metricOrder = ['open', 'deal', 'cold', 'contacted', 'opened'];
        return metricOrder.map((metricKey) => {
            const metric = getTeamPulseMetric(record, metricKey);
            const isActive = teamPulseUiState.selectedMetric === metricKey;
            return `
                <button
                    type="button"
                    class="team-pulse-metric ${metric.tone} ${isActive ? 'active' : ''}"
                    onclick="event.stopPropagation(); setTeamPulseModalMetric('${metricKey}')"
                >
                    <div class="team-pulse-metric-label">${metric.label}</div>
                    <div class="team-pulse-metric-value">${metric.count}</div>
                    <div class="team-pulse-metric-helper">${metric.helper}</div>
                </button>
            `;
        }).join('');
    }

    function buildTeamPulseDetailList(items, emptyText, options = {}) {
        const itemClass = options.itemClass || 'team-pulse-detail-item';
        const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 6;
        const page = Number(options.page) || 1;
        const ownerName = options.ownerName || '';
        
        if (!items.length) {
            return {
                listHtml: `
                    <div class="team-pulse-empty">
                        <div class="team-pulse-empty-copy">
                            <strong>Kayıt bulunamadı.</strong>
                            <span>${emptyText}</span>
                        </div>
                    </div>
                `,
                paginationHtml: ''
            };
        }

        const totalPages = Math.ceil(items.length / limit);
        const startIndex = (page - 1) * limit;
        const currentItems = items.slice(startIndex, startIndex + limit);

        const listHtml = currentItems.map((item) => {
            const initial = String(item.businessName || '?').trim().charAt(0).toUpperCase();
            return `
            <button type="button" class="${itemClass}" onclick="event.stopPropagation(); openTaskModal('${escapeHtml(item.taskId)}')">
                <div class="tpi-left">
                    <div class="tpi-avatar">${escapeHtml(initial)}</div>
                    <div class="tpi-info">
                        <strong>${escapeHtml(item.businessName)}</strong>
                        <span>${escapeHtml(ownerName || '-')}</span>
                    </div>
                </div>
                <div class="tpi-right">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
            </button>
            `;
        }).join('');

        if (totalPages <= 1) return { listHtml, paginationHtml: '' };

        const prevDisabled = page === 1 ? 'disabled' : '';
        const nextDisabled = page === totalPages ? 'disabled' : '';

        const paginationHtml = `
            <div class="tp-modal-pagination" style="grid-column: 1 / -1; margin-top: 0; padding-top: 0; border-top: none; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
                <button type="button" class="tp-page-btn" ${prevDisabled} onclick="event.stopPropagation(); setTeamPulseModalPage(${page - 1})">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <span class="tp-page-info">Sayfa <strong>${page}</strong> / ${totalPages} <span class="tp-page-total">(${items.length} Kayıt)</span></span>
                <button type="button" class="tp-page-btn" ${nextDisabled} onclick="event.stopPropagation(); setTeamPulseModalPage(${page + 1})">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
            </div>
        `;

        return { listHtml, paginationHtml };
    }

    function buildTeamPulseCardHtml(record) {
        const dailyMetrics = record.metrics.daily || {};
        const dailyCounts = {
            contacted: dailyMetrics.contacted?.count || 0,
            idle: dailyMetrics.idle?.count || 0,
            opened: dailyMetrics.opened?.count || 0,
            open: dailyMetrics.open?.count || 0,
        };
        const idleTone = dailyCounts.idle > 0 ? 'risk' : 'calm';
        const badgeLabel = dailyCounts.idle > 0 ? 'Takip bekliyor' : dailyCounts.contacted > 0 ? 'Akışta' : 'Sakin';

        return `
            <button type="button" class="team-pulse-card ${idleTone}" onclick="openTeamPulseModal('${record.key}')">
                <div class="team-pulse-card-head">
                    <div class="team-pulse-user-block">
                        <div class="team-pulse-avatar">${escapeHtml(String(record.user.name || '?').trim().charAt(0) || '?')}</div>
                        <div class="team-pulse-user">
                            <strong>${escapeHtml(record.user.name || '-')}</strong>
                            <span>${escapeHtml(record.user.team || 'Takım atanmadı')}</span>
                        </div>
                    </div>
                    <div class="team-pulse-top-badges">
                        <span class="team-pulse-top-badge neutral">${badgeLabel}</span>
                    </div>
                </div>
                <div class="team-pulse-summary-strip">
                    <div class="team-pulse-summary-cell contacted">
                        <span class="team-pulse-mini-label">Görüşülen</span>
                        <strong>${dailyCounts.contacted}</strong>
                    </div>
                    <div class="team-pulse-summary-cell open">
                        <span class="team-pulse-mini-label">Open Task</span>
                        <strong>${dailyCounts.open}</strong>
                    </div>
                </div>
                <div class="team-pulse-card-footer">
                    <span class="team-pulse-meta-chip">Pasif Görev <strong>${dailyCounts.idle}</strong></span>
                    <span class="team-pulse-detail-chip">Detayı Aç</span>
                </div>
            </button>
        `;
    }

    function buildTeamPulseModalHtml(record) {
        const selectedMetric = getTeamPulseMetric(record, teamPulseUiState.selectedMetric || 'open');
        const openMetric = getTeamPulseMetric(record, 'open');
        const dealMetric = getTeamPulseMetric(record, 'deal');
        const coldMetric = getTeamPulseMetric(record, 'cold');
        const contactedMetric = getTeamPulseMetric(record, 'contacted');
        const openedMetric = getTeamPulseMetric(record, 'opened');

        const listData = buildTeamPulseDetailList(selectedMetric.items, selectedMetric.empty, { itemClass: 'tpsw-list-item', limit: 6, page: teamPulseUiState.currentPage, ownerName: record.user?.name || '-' });

        return `
            <div class="tp-smart-wizard">
                <div class="tpsw-header-box">
                    <div class="tpsw-header-top">
                        <div class="tpsw-identity-stack">
                            <div class="tpsw-avatar-ring">
                                <div class="tpsw-avatar">${escapeHtml(String(record.user.name || '?').trim().charAt(0).toUpperCase())}</div>
                            </div>
                            <div class="tpsw-identity-text">
                                <h3>${escapeHtml(record.user.name || '-')}</h3>
                                <span class="tpsw-team">${escapeHtml(record.user.team || 'Takım Yok')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tpsw-seg-wrap">
                        <div class="tpsw-seg-control">
                            <button type="button" class="tpsw-seg-btn ${teamPulseUiState.selectedMetric === 'open' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseModalMetric('open')">
                                Açık <span class="tpsw-seg-badge">${openMetric.count}</span>
                            </button>
                            <button type="button" class="tpsw-seg-btn ${teamPulseUiState.selectedMetric === 'deal' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseModalMetric('deal')">
                                Deal <span class="tpsw-seg-badge">${dealMetric.count}</span>
                            </button>
                            <button type="button" class="tpsw-seg-btn ${teamPulseUiState.selectedMetric === 'cold' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseModalMetric('cold')">
                                Cold <span class="tpsw-seg-badge">${coldMetric.count}</span>
                            </button>
                            <button type="button" class="tpsw-seg-btn ${teamPulseUiState.selectedMetric === 'contacted' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseModalMetric('contacted')">
                                Görüşülen <span class="tpsw-seg-badge">${contactedMetric.count}</span>
                            </button>
                            <button type="button" class="tpsw-seg-btn ${teamPulseUiState.selectedMetric === 'opened' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseModalMetric('opened')">
                                Yeni <span class="tpsw-seg-badge">${openedMetric.count}</span>
                            </button>
                        </div>
                    </div>
                </div>

                ${teamPulseUiState.selectedMetric === 'contacted' ? `
                <div class="tpsw-sub-filters">
                    <div class="tpsw-sub-seg">
                        <button type="button" class="tpsw-sub-btn ${teamPulseUiState.contactedPeriod === 'daily' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseContactedPeriod('daily')">Bugün</button>
                        <button type="button" class="tpsw-sub-btn ${teamPulseUiState.contactedPeriod === 'weekly' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseContactedPeriod('weekly')">Bu Hafta</button>
                        <button type="button" class="tpsw-sub-btn ${teamPulseUiState.contactedPeriod === 'monthly' ? 'active' : ''}" onclick="event.stopPropagation(); setTeamPulseContactedPeriod('monthly')">Bu Ay</button>
                    </div>
                </div>
                ` : ''}

                <div class="tpsw-body">
                    ${listData.paginationHtml}
                    <div class="tpsw-list-grid">
                        ${listData.listHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function applyTeamPulseStageScale() {
        const stage = document.getElementById('teamPulseStage');
        const container = document.getElementById('teamPulseContainer');
        if (!stage || !container) return;

        const cards = Array.from(container.querySelectorAll('.team-pulse-card'));
        if (!cards.length || window.innerWidth < 1180) {
            stage.style.setProperty('--team-pulse-scale', '1');
            stage.style.setProperty('--team-pulse-stage-height', 'auto');
            return;
        }

        const stageWidth = stage.clientWidth || 0;
        const cardWidth = 240;
        const gap = 14;
        const requiredWidth = (cards.length * cardWidth) + (Math.max(cards.length - 1, 0) * gap);
        const scale = requiredWidth > stageWidth ? Math.max(0.68, stageWidth / requiredWidth) : 1;
        const sampleHeight = cards[0]?.offsetHeight || 0;

        stage.style.setProperty('--team-pulse-scale', String(scale));
        stage.style.setProperty('--team-pulse-stage-height', sampleHeight > 0 ? `${Math.ceil(sampleHeight * scale)}px` : 'auto');
    }

    async function renderTeamPulse(options = {}) {
        const pulseContainer = document.getElementById('teamPulseContainer');
        if (!pulseContainer) return;
        const silent = Boolean(options?.silent);

        const requestId = ++teamPulseRequestId;
        if (!silent) {
            pulseContainer.innerHTML = `<div class="team-pulse-empty-board">Personel performans kartları yükleniyor...</div>`;
        }

        try {
            const payload = await DataService.apiRequest('/reports/team-pulse');
            if (requestId !== teamPulseRequestId) return;

            const records = Array.isArray(payload?.records) ? payload.records : [];
            teamPulseUiState.recordsByKey = records.reduce((acc, record) => {
                acc[record.key] = record;
                return acc;
            }, {});

            if (!records.length) {
                pulseContainer.innerHTML = `<div class="team-pulse-empty-board">Bu filtrede gösterilecek personel performans kartı yok.</div>`;
                if (document.getElementById('teamPulseModal')?.style.display === 'flex') {
                    closeModal('teamPulseModal');
                }
                return;
            }

            pulseContainer.innerHTML = records.map(buildTeamPulseCardHtml).join('');
            requestAnimationFrame(() => {
                applyTeamPulseStageScale();
            });

            if (!teamPulseResizeBound) {
                window.addEventListener('resize', applyTeamPulseStageScale, { passive: true });
                teamPulseResizeBound = true;
            }

            if (teamPulseUiState.selectedUserKey && document.getElementById('teamPulseModal')?.style.display === 'flex') {
                if (teamPulseUiState.recordsByKey[teamPulseUiState.selectedUserKey]) {
                    renderTeamPulseModal();
                } else {
                    closeModal('teamPulseModal');
                }
            }
        } catch (err) {
            console.error('Team pulse summary load failed:', err);
            if (requestId !== teamPulseRequestId) return;
            teamPulseUiState.recordsByKey = {};
            if (!silent) {
                pulseContainer.innerHTML = `<div class="team-pulse-empty-board">Personel performans kartlari su anda yuklenemedi. Lutfen tekrar deneyin.</div>`;
            }
            if (!silent && document.getElementById('teamPulseModal')?.style.display === 'flex') {
                closeModal('teamPulseModal');
            }
        }
    }

    function getTaskReportCreationChannelLabel(channel) {
        const raw = String(channel || '').toUpperCase();
        if (raw === 'REQUEST_FLOW') return 'Görev Al / Yarat';
        if (raw === 'MANUAL_TASK_CREATE') return 'Task Yarat';
        if (raw === 'PROJECT_GENERATED') return 'Proje';
        return 'Bilinmiyor';
    }

    function getTaskAgeDays(task) {
        const createdAtMs = new Date(task.createdAt || 0).getTime();
        if (!createdAtMs) return 0;
        return Math.max(0, Math.floor((Date.now() - createdAtMs) / 86400000));
    }

    function getTaskLastActionMs(task) {
        if (task.logs?.length > 0) {
            return parseLogDate(task.logs[0].date) || new Date(task.createdAt || 0).getTime();
        }
        return new Date(task.createdAt || 0).getTime();
    }

    function isIdleTask(task) {
        if (!isActiveTask(task.status)) return false;
        if (task.status === 'followup' && task.nextCallDate) return false;
        const lastActionMs = getTaskLastActionMs(task);
        return lastActionMs > 0 && lastActionMs < (Date.now() - (5 * 24 * 60 * 60 * 1000));
    }

    const taskReportUiState = {
        items: [],
        total: 0,
        page: 1,
        limit: ITEMS_PER_PAGE_TASKS,
        stats: {
            total: 0,
            open: 0,
            closed: 0,
            deal: 0,
            cold: 0,
            idle: 0,
        },
    };

    function updateTaskReportDistrictOptions() {
        const citySelect = document.getElementById('taskRepCity');
        const districtSelect = document.getElementById('taskRepDistrict');
        if (!districtSelect) return;

        const selectedCity = citySelect?.value || '';
        const currentValue = districtSelect.value;
        districtSelect.innerHTML = '<option value="">Tümü</option>';

        const districtList = selectedCity
            ? (DISTRICT_DATA[selectedCity] || []).slice()
            : Array.from(new Set(Object.values(DISTRICT_DATA || {}).flat()));

        districtList
            .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'tr'))
            .forEach((district) => districtSelect.add(new Option(district, district)));

        if (currentValue && districtList.includes(currentValue)) {
            districtSelect.value = currentValue;
        }
    }

    function getTaskReportSourceLabel(sourceKey) {
        if (typeof getTaskSourceLabel === 'function') return getTaskSourceLabel(sourceKey || '');
        if (typeof apiSourceToUi === 'function') return apiSourceToUi(sourceKey || '');
        const raw = String(sourceKey || '').trim().toUpperCase();
        if (!raw) return '-';
        if (raw === 'OLD_RAKIP') return 'Old Account Rakip';
        if (raw === 'OLD_QUERY') return 'Old Account Query';
        if (raw === 'QUERY') return 'Query';
        if (raw === 'LEAD') return 'Lead';
        if (raw === 'RAKIP') return 'Rakip';
        if (raw === 'REFERANS') return 'Referans';
        if (raw === 'OLD') return 'Old Account';
        if (raw === 'FRESH') return 'Fresh Account';
        return String(sourceKey || '-');
    }

    function normalizeTaskReportStats(stats = {}) {
        return {
            total: Number(stats.total || 0),
            open: Number(stats.open || 0),
            closed: Number(stats.closed || 0),
            deal: Number(stats.deal || 0),
            cold: Number(stats.cold || 0),
            idle: Number(stats.idle || 0),
        };
    }

    function normalizeTaskReportResponse(response, fallbackPage = 1, fallbackLimit = ITEMS_PER_PAGE_TASKS) {
        if (Array.isArray(response)) {
            const rows = response;
            return {
                items: rows,
                total: rows.length,
                page: fallbackPage,
                limit: fallbackLimit,
                stats: {
                    total: rows.length,
                    open: rows.filter((row) => isActiveTask(String(row?.statusKey || '').toLowerCase())).length,
                    closed: rows.filter((row) => PASSIVE_STATUSES.includes(String(row?.statusKey || '').toLowerCase())).length,
                    deal: rows.filter((row) => String(row?.statusKey || '').toLowerCase() === 'deal').length,
                    cold: rows.filter((row) => String(row?.statusKey || '').toLowerCase() === 'cold').length,
                    idle: rows.filter((row) => isIdleTask({
                        status: String(row?.statusKey || '').toLowerCase(),
                        nextCallDate: row?.followUpDate || '',
                        createdAt: row?.createdAt || '',
                        logs: row?.lastActionDate
                            ? [{ date: formatDate(row.lastActionDate), text: row.logContent || '' }]
                            : [],
                    })).length,
                },
            };
        }

        return {
            items: Array.isArray(response?.items) ? response.items : [],
            total: Number(response?.total || 0),
            page: Number(response?.page || fallbackPage),
            limit: Number(response?.limit || fallbackLimit),
            stats: normalizeTaskReportStats(response?.stats),
        };
    }

    function populateTaskReportFilters() {
        const assigneeSelect = document.getElementById('taskRepAssignee');
        if (assigneeSelect && assigneeSelect.options.length <= 1) {
            assigneeSelect.innerHTML = '<option value="">Tümü</option>';
            const teamGroup = document.createElement('optgroup');
            teamGroup.label = 'Takımlar';
            teamGroup.appendChild(new Option('Team 1', 'Team 1'));
            teamGroup.appendChild(new Option('Team 2', 'Team 2'));
            assigneeSelect.appendChild(teamGroup);

            const userGroup = document.createElement('optgroup');
            userGroup.label = 'Personeller';
            AppState.users
                .filter((u) => u.status !== 'Pasif')
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'))
                .forEach((u) => userGroup.appendChild(new Option(u.name, u.name)));
            assigneeSelect.appendChild(userGroup);
        }

        const projectSelect = document.getElementById('taskRepProject');
        if (projectSelect && projectSelect.options.length <= 1) {
            AppState.projects
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'))
                .forEach((project) => projectSelect.add(new Option(project.name, project.id)));
        }

        const mainCatSelect = document.getElementById('taskRepMainCategory');
        if (mainCatSelect && mainCatSelect.options.length <= 1) {
            Object.keys(AppState.dynamicCategories)
                .sort((a, b) => a.localeCompare(b, 'tr'))
                .forEach((category) => mainCatSelect.add(new Option(category, category)));
        }

        const citySelect = document.getElementById('taskRepCity');
        if (citySelect && citySelect.options.length <= 1) {
            const uniqueCities = Array.from(new Set(Object.keys(DISTRICT_DATA || {}))).sort((a, b) => a.localeCompare(b, 'tr'));
            uniqueCities.forEach((city) => citySelect.add(new Option(city, city)));
        }

        const districtSelect = document.getElementById('taskRepDistrict');
        if (districtSelect && districtSelect.options.length <= 1) {
            updateTaskReportDistrictOptions();
        }

        if (citySelect && !citySelect.dataset.boundTaskReportCityChange) {
            citySelect.addEventListener('change', updateTaskReportDistrictOptions);
            citySelect.dataset.boundTaskReportCityChange = 'true';
        }

        updateTaskReportSubCategories();
    }

    function updateTaskReportSubCategories() {
        const mainCategory = document.getElementById('taskRepMainCategory')?.value || '';
        const subCategorySelect = document.getElementById('taskRepSubCategory');
        if (!subCategorySelect) return;
        const currentValue = subCategorySelect.value;
        subCategorySelect.innerHTML = '<option value="">Tümü</option>';

        const subCategories = mainCategory
            ? (AppState.dynamicCategories[mainCategory] || [])
            : Array.from(new Set(Object.values(AppState.dynamicCategories).flat()));

        subCategories
            .slice()
            .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'tr'))
            .forEach((subCategory) => subCategorySelect.add(new Option(subCategory, subCategory)));

        if (currentValue) subCategorySelect.value = currentValue;
    }

    function buildTaskReportQuery(options = {}) {
        const getValue = (id) => document.getElementById(id)?.value || '';
        const creationChannel = getValue('taskRepCreationChannel');
        const type = getValue('taskRepType');
        const status = getValue('taskRepStatus');
        const assignee = getValue('taskRepAssignee');
        const projectId = getValue('taskRepProject');
        const source = getValue('taskRepSource');
        const mainCategory = getValue('taskRepMainCategory');
        const subCategory = getValue('taskRepSubCategory');
        const city = getValue('taskRepCity');
        const district = getValue('taskRepDistrict');
        const startDate = getValue('taskRepStartDate');
        const endDate = getValue('taskRepEndDate');

        const query = new URLSearchParams();
        if (creationChannel) query.set('creationChannel', creationChannel);
        if (type) query.set('type', type);
        if (status) query.set('status', status.toUpperCase());
        if (projectId) query.set('projectId', projectId);
        if (source) query.set('source', typeof normalizeTaskSourceKey === 'function' ? normalizeTaskSourceKey(source) : source);
        if (mainCategory) query.set('mainCategory', mainCategory);
        if (subCategory) query.set('subCategory', subCategory);
        if (city) query.set('city', city);
        if (district) query.set('district', district);
        if (startDate) query.set('from', startDate);
        if (endDate) query.set('to', endDate);

        const assigneeScope = resolveTaskAssigneeQuery(assignee);
        if (assigneeScope.ownerId) query.set('ownerId', assigneeScope.ownerId);
        if (assigneeScope.team) query.set('team', assigneeScope.team);
        if (assigneeScope.historicalAssignee) query.set('historicalAssignee', assigneeScope.historicalAssignee);
        if (options.page) query.set('page', String(options.page));
        if (options.limit) query.set('limit', String(options.limit));
        return query.toString();
    }

    function setTaskReportStat(id, value) {
        const el = document.getElementById(id);
        if (el) el.innerText = String(value);
    }

    let hasAppliedTaskReportFilters = false;

    function resetTaskReportView() {
        hasAppliedTaskReportFilters = false;
        setTaskReportStat('taskRepTotalCount', 0);
        setTaskReportStat('taskRepOpenCount', 0);
        setTaskReportStat('taskRepClosedCount', 0);
        setTaskReportStat('taskRepDealCount', 0);
        setTaskReportStat('taskRepColdCount', 0);
        setTaskReportStat('taskRepIdleCount', 0);
        taskReportUiState.items = [];
        taskReportUiState.total = 0;
        taskReportUiState.page = 1;
        taskReportUiState.stats = normalizeTaskReportStats();
        displayTaskReportRows();
    }

    function prepareTaskReportView() {
        populateTaskReportFilters();
        displayTaskReportRows();
    }

    async function renderTaskReports(options = {}) {
        populateTaskReportFilters();
        hasAppliedTaskReportFilters = true;
        const requestedPage = Number.isFinite(Number(options?.page)) ? Math.max(1, Number(options.page)) : 1;
        const tbody = document.getElementById('taskReportTbody');
        if (tbody && !options?.silent) {
            tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div style="font-size:42px; opacity:0.28; margin-bottom:10px;">⏳</div><h3>Rapor yükleniyor</h3><p>Görev verileri hazırlanıyor.</p></div></td></tr>`;
        }

        try {
            const query = buildTaskReportQuery({ page: requestedPage, limit: taskReportUiState.limit });
            const response = await DataService.apiRequest(`/reports/tasks${query ? `?${query}` : ''}`);
            const payload = normalizeTaskReportResponse(response, requestedPage, taskReportUiState.limit);

            taskReportUiState.items = payload.items;
            taskReportUiState.total = payload.total;
            taskReportUiState.page = payload.page;
            taskReportUiState.limit = payload.limit;
            taskReportUiState.stats = payload.stats;

            setTaskReportStat('taskRepTotalCount', payload.stats.total);
            setTaskReportStat('taskRepOpenCount', payload.stats.open);
            setTaskReportStat('taskRepClosedCount', payload.stats.closed);
            setTaskReportStat('taskRepDealCount', payload.stats.deal);
            setTaskReportStat('taskRepColdCount', payload.stats.cold);
            setTaskReportStat('taskRepIdleCount', payload.stats.idle);

            displayTaskReportRows();
        } catch (err) {
            console.error('Task reports load failed:', err);
            taskReportUiState.items = [];
            taskReportUiState.total = 0;
            taskReportUiState.page = 1;
            taskReportUiState.stats = normalizeTaskReportStats();
            displayTaskReportRows();
        }
    }

    function displayTaskReportRows() {
        const tbody = document.getElementById('taskReportTbody');
        const pagination = document.getElementById('taskReportPagination');
        if (!tbody || !pagination) return;

        if (!hasAppliedTaskReportFilters) {
            tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div style="font-size:42px; opacity:0.28; margin-bottom:10px;">🔎</div><h3>Rapor hazır</h3><p>Önce filtreleri seçip <strong>Filtrele</strong> butonuna basın.</p></div></td></tr>`;
            pagination.innerHTML = '';
            return;
        }

        const rows = taskReportUiState.items || [];
        const page = taskReportUiState.page || 1;
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div style="font-size:42px; opacity:0.28; margin-bottom:10px;">🧾</div><h3>Sonuç bulunamadı</h3><p>Filtreleri güncelleyip tekrar deneyin.</p></div></td></tr>`;
            pagination.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(taskReportUiState.total / taskReportUiState.limit);
        const currentPage = Math.min(page, totalPages || 1);

        tbody.innerHTML = rows.map((row) => `
            <tr style="cursor:pointer;" onclick="openTaskModal('${escapeHtml(row.id)}')">
                <td>${escapeHtml(String(row.createdAt || '-').split('T')[0])}</td>
                <td><strong>${escapeHtml(row.businessName || '-')}</strong><br><span style="font-size:11px; color:#64748b;">📍 ${escapeHtml(row.city || '-')} ${row.district ? `/ ${escapeHtml(row.district)}` : ''}</span></td>
                <td><span class="modern-badge" style="background:#ecfeff; color:#155e75; border:1px solid #a5f3fc;">${escapeHtml(getTaskReportCreationChannelLabel(row.creationChannel))}</span></td>
                <td><strong>${escapeHtml(row.projectId ? 'Proje' : 'Genel')}</strong><br><span style="font-size:11px; color:#64748b;">${escapeHtml((AppState.projects || []).find((project) => project.id === row.projectId)?.name || '-')}</span></td>
                <td><strong>${escapeHtml(row.sourceLabel || getTaskReportSourceLabel(row.sourceKey || ''))}</strong><br><span style="font-size:11px; color:#64748b;">${escapeHtml(row.mainCategory || '-')} / ${escapeHtml(row.subCategory || '-')}</span></td>
                <td>${escapeHtml(row.mainCategory || '-')}</td>
                <td>${escapeHtml(row.subCategory || '-')}</td>
                <td><strong>${escapeHtml(row.assignee || '-')}</strong><br><span style="font-size:11px; color:#64748b;">Oluşturan: ${escapeHtml(row.createdByName || 'Sistem')}</span></td>
                <td><span class="modern-badge" style="background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1;">${escapeHtml(typeof getTaskStatusLabel === 'function' ? getTaskStatusLabel(row.statusKey || '') : (TASK_STATUS_LABELS[String(row.statusKey || '').toLowerCase()] || row.statusKey || '-'))}</span></td>
                <td>${escapeHtml(row.city || '-')}<br><span style="font-size:11px; color:#64748b;">${escapeHtml(row.district || '-')}</span></td>
                <td><span style="font-size:11px; color:#64748b;">${escapeHtml(row.lastActionDate || '-')}</span></td>
            </tr>
        `).join('');

        renderPagination(pagination, taskReportUiState.total, currentPage, taskReportUiState.limit, (nextPage) => {
            renderTaskReports({ page: nextPage, silent: true });
        }, { compact: true, resultLabel: 'kayıt' });
    }

    function clearTaskReportFilters() {
        [
            'taskRepCreationChannel', 'taskRepType', 'taskRepStatus', 'taskRepAssignee', 'taskRepProject',
            'taskRepSource', 'taskRepMainCategory', 'taskRepSubCategory', 'taskRepCity', 'taskRepDistrict',
            'taskRepStartDate', 'taskRepEndDate',
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        updateTaskReportSubCategories();
        updateTaskReportDistrictOptions();
        resetTaskReportView();
    }

    async function exportTaskReportExcel() {
        try {
            const query = buildTaskReportQuery();
            const response = await DataService.apiRequest(`/reports/tasks${query ? `?${query}` : ''}`);
            const rows = Array.isArray(response) ? response : (Array.isArray(response?.items) ? response.items : []);
            if (!rows.length) {
                showToast('Export için rapor satırı bulunamadı.', 'warning');
                return;
            }
            const csvRows = rows.map((row) => ({
                olusturma_tarihi: String(row.createdAt || '').split('T')[0],
                isletme: row.businessName || '',
                il: row.city || '',
                ilce: row.district || '',
                kanal: getTaskReportCreationChannelLabel(row.creationChannel),
                gorev_tipi: row.projectId ? 'Proje' : 'Genel',
                proje: (AppState.projects || []).find((project) => project.id === row.projectId)?.name || '',
                kaynak: row.sourceLabel || getTaskReportSourceLabel(row.sourceKey || ''),
                ana_kategori: row.mainCategory || '',
                alt_kategori: row.subCategory || '',
                sorumlu: row.assignee || '',
                olusturan: row.createdByName || 'Sistem',
                durum: typeof getTaskStatusLabel === 'function' ? getTaskStatusLabel(row.statusKey || '') : (TASK_STATUS_LABELS[String(row.statusKey || '').toLowerCase()] || row.statusKey || ''),
                son_islem_tarihi: row.lastActionDate || '',
                atil_mi: row.isIdle ? 'Evet' : 'Hayır',
                gorev_notu: row.logContent || '',
            }));

            const headers = Object.keys(csvRows[0]);
            const escapeCsv = (value) => {
                const raw = value == null ? '' : String(value);
                return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
            };
            const csv = [headers.join(','), ...csvRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','))].join('\n');
            const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `task_raporlari_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Task report export failed:', err);
            showToast('Task raporu dışa aktarılırken hata oluştu.', 'error');
        }
    }

    function switchTaskListSubtab(view) {
        if (view === 'report') {
            if (typeof switchPage === 'function') switchPage('page-task-list');
            if (typeof switchPoolTab === 'function') switchPoolTab('reports');
            return;
        }
        if (typeof switchPage === 'function') switchPage('page-all-tasks');
        renderAllTasks();
    }

    function renderTeamPulseModal() {
        const modalBody = document.getElementById('teamPulseModalBody');
        const overlay = document.getElementById('teamPulseModal');
        const record = teamPulseUiState.recordsByKey[teamPulseUiState.selectedUserKey];
        if (!modalBody || !overlay || !record) return;
        modalBody.innerHTML = buildTeamPulseModalHtml(record);
        overlay.style.display = 'flex';
    }

    function openTeamPulseModal(userKey, metricKey = 'open') {
        if (!userKey || !teamPulseUiState.recordsByKey[userKey]) return;
        teamPulseUiState.selectedUserKey = userKey;
        teamPulseUiState.modalPeriod = 'daily';
        teamPulseUiState.selectedMetric = metricKey || 'open';
        teamPulseUiState.currentPage = 1;
        renderTeamPulseModal();
    }

    function setTeamPulseModalPeriod(period) {
        teamPulseUiState.modalPeriod = TEAM_PULSE_PERIODS.includes(period) ? period : 'daily';
        renderTeamPulseModal();
    }

    function setTeamPulseModalMetric(metricKey) {
        if (!metricKey) return;
        teamPulseUiState.selectedMetric = metricKey;
        teamPulseUiState.currentPage = 1;
        renderTeamPulseModal();
    }

    function setTeamPulseModalPage(page) {
        if (!page) return;
        teamPulseUiState.currentPage = page;
        renderTeamPulseModal();
    }

    function setTeamPulseContactedPeriod(period) {
        if (!['daily', 'weekly', 'monthly'].includes(period)) return;
        teamPulseUiState.contactedPeriod = period;
        teamPulseUiState.currentPage = 1;
        renderTeamPulseModal();
    }

    function setTeamPulseRecords(records) {
        const safeRecords = Array.isArray(records) ? records : [];
        teamPulseUiState.recordsByKey = safeRecords.reduce((acc, record) => {
            if (record?.key) acc[record.key] = record;
            return acc;
        }, {});
    }

    function formatDealDurationDisplay(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return '-';
        if (/\bay\b/i.test(raw)) return raw;
        return `${raw} Ay`;
    }

    function buildTaskSavePayloadFallback({ newStatus = '', logType = '', logText = '', nextCallDate = '', dealDetails = null }) {
        let finalLogStr = '';

        if (newStatus === 'deal' && dealDetails) {
            if (logText) finalLogStr = `[Deal Notu] ${logText}`;
        } else {
            if (logType) {
                finalLogStr += `[${logType}] `;
                if (logType === 'Tekrar Aranacak' && nextCallDate) {
                    finalLogStr += `(Tarih: ${nextCallDate}) `;
                }
            }
            if (logText) finalLogStr += logText;
        }

        const reasonMap = {
            'İşletmeye Ulaşılamadı': 'ISLETMEYE_ULASILAMADI',
            'Yetkiliye Ulaşılamadı': 'YETKILIYE_ULASILAMADI',
            'Yetkiliye Ulaşıldı': 'YETKILIYE_ULASILDI',
            'İşletme Çalışmak İstemiyor': 'ISLETME_CALISMAK_ISTEMIYOR',
            'İşletme Kapanmış': 'ISLETME_KAPANMIS',
            'Tekrar Aranacak': 'TEKRAR_ARANACAK',
        };

        const patchPayload = {};
        if (newStatus === 'deal' && dealDetails) patchPayload.dealDetails = dealDetails;
        if (logType === 'Tekrar Aranacak' && nextCallDate) {
            patchPayload.nextCallDate = nextCallDate;
            if (!newStatus) patchPayload.status = 'followup';
        }
        if (newStatus) patchPayload.status = newStatus;
        if (finalLogStr) {
            patchPayload.activity = {
                text: finalLogStr,
                reason: reasonMap[logType] || 'GORUSME',
                followUpDate: nextCallDate || undefined,
            };
        }

        return { patchPayload };
    }

    // --- Kart Oluşturma ---
    function createCard(task) {
        const biz = AppState.getBizMap().get(task.businessId) || task;
        const label = TASK_STATUS_LABELS[task.status] || '-';
        const card = document.createElement('div');
        card.className = `emerald-task-card ${task.status}`;
        card.setAttribute('onclick', `openTaskModal('${task.id}')`);
        card.innerHTML = `
            <div class="etc-header" style="padding: 12px 12px 5px 12px;">
                <div class="etc-radar-glass">
                    <span class="etc-radar-dot ${task.status}"></span>
                    <span style="font-size:11px; font-weight:800; margin-left:6px; color:#334155; text-transform:uppercase;">${label}</span>
                </div>
                <div class="etc-assignee">👤 ${task.assignee}</div>
            </div>
            <div class="etc-body" style="padding: 8px 12px;">
                <h4 title="${biz.companyName}" style="font-size:14px;">${biz.companyName || '-'}</h4>
            </div>
            <div class="etc-footer-capsule" style="padding: 8px 12px; font-size:10px;">
                <span>📍 ${biz.city || '-'}</span>
                <span>🏷️ ${task.mainCategory || '-'}${task.subCategory ? ' > ' + task.subCategory : ''}</span>
            </div>`;
        return card;
    }

    function createMinimalCard(task) {
        const biz = AppState.getBizMap().get(task.businessId) || task;

        // Durum renklerini JS içinde tanımla — CSS bağımlılığı yok
        const statusColors = {
            hot:      { border: '#ef4444', ribbon: 'linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)' },
            cold:     { border: '#94a3b8', ribbon: 'linear-gradient(135deg,#94a3b8 0%,#475569 100%)' },
            deal:     { border: '#10b981', ribbon: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' },
            new:      { border: '#3b82f6', ribbon: 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)' },
            nothot:   { border: '#f59e0b', ribbon: 'linear-gradient(135deg,#f59e0b 0%,#b45309 100%)' },
            followup: { border: '#d97706', ribbon: 'linear-gradient(135deg,#d97706 0%,#9a3412 100%)' },
        };
        const sc = statusColors[task.status] || { border: '#cbd5e1', ribbon: 'linear-gradient(135deg,#94a3b8 0%,#475569 100%)' };
        let label = TASK_STATUS_LABELS[task.status] || task.status || '-';
        let followupMetaHtml = '';
        if (task.status === 'followup' && task.nextCallDate) {
            const dObj = new Date(task.nextCallDate);
            if(!isNaN(dObj)) {
                const followupDate = dObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const followupTime = dObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                followupMetaHtml = `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:2px; margin-top:4px; text-transform:none; letter-spacing:0;">
                        <span style="font-size:10px; font-weight:700; line-height:1.1; opacity:0.95;">${followupDate}</span>
                        <span style="font-size:10px; font-weight:600; line-height:1.1; opacity:0.86;">${followupTime}</span>
                    </div>
                `;
            }
        }

        const card = document.createElement('div');
        card.className = `left-border-card ${task.status}`;
        card.setAttribute('onclick', `openTaskModal('${task.id}')`);
        card.style.cssText = `
            background:#ffffff;
            border:1px solid #e2e8f0;
            border-left:4px solid ${sc.border};
            border-radius:12px;
            padding:0;
            margin-bottom:10px;
            display:flex;
            align-items:stretch;
            overflow:hidden;
            box-shadow:0 2px 6px rgba(0,0,0,0.04);
            transition:all 0.2s ease;
            cursor:pointer;
        `;
        
        const me = AppState.loggedInUser || {};
        const isMineById = Boolean(me.id && task.ownerId && me.id === task.ownerId);
        const isMineByName = Boolean(me.name && task.assignee && me.name === task.assignee);
        const isMineByEmail = Boolean(me.email && task.assignee && me.email === task.assignee);
        const isMine = isMineById || isMineByName || isMineByEmail;

        const assigneeHtml = isMine
            ? '' 
            : `<span style="font-size:12px;font-weight:700;color:#0f766e;margin-left:8px;padding-left:8px;border-left:1px solid #cbd5e1;">👤 ${task.assignee}</span>`;

        let lastActionDate = '-';
        if (task.logs && task.logs.length > 0) {
            lastActionDate = task.logs[0].date.split(' ')[0];
        } else if (task.createdAt) {
            lastActionDate = formatDate(task.createdAt).split(' ')[0];
        }
        
        const lastActionHtml = `<span style="font-size:11px;font-weight:600;color:#475569;white-space:nowrap;" title="Son İşlem Tarihi">🕒 Son: ${lastActionDate}</span>`;
        const sourceHtml = `<span style="font-size:11px;font-weight:600;color:#475569;white-space:nowrap;">📁 ${task.sourceType || '-'}</span>`;

        card.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; flex:1; min-width:0; gap:15px;">
                <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">
                    <h4 style="font-size:15px;font-weight:700;color:#0f172a;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${biz.companyName}">${biz.companyName || '-'}</h4>
                    <div style="display:flex; align-items:center;">
                        <span style="font-size:12px;color:#64748b;">📍 ${biz.city || '-'}</span>
                        ${assigneeHtml}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end; flex-shrink:0;">
                    ${sourceHtml}
                    ${lastActionHtml}
                </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px 15px; min-width:90px; text-align:center; font-size:12px; font-weight:800; color:#ffffff; text-transform:uppercase; letter-spacing:1px; border-radius:0 10px 10px 0; flex-shrink:0; background:${sc.ribbon}; text-shadow:0 1px 2px rgba(0,0,0,0.2); line-height:1.15;">
                <span>${label}</span>
                ${followupMetaHtml}
            </div>
        `;

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 6px 18px rgba(0,0,0,0.09)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)';
        });

        return card;
    }

    window.createMinimalTaskCard = createMinimalCard;

    // --- Görev Listesi Render ---
    function getSelectedTaskStatuses(selector) {
        const values = Array.from(document.querySelectorAll(selector))
            .filter((el) => el.checked)
            .map((el) => String(el.value || '').trim().toLowerCase());
        return values.map((value) => {
            if (value === 'nothot') return 'NOT_HOT';
            if (value === 'followup') return 'FOLLOWUP';
            return value.toUpperCase();
        });
    }

    function resolveTaskAssigneeQuery(filterValue) {
        const raw = String(filterValue || '').trim();
        if (!raw) return {};
        if (raw === 'Team 1' || raw === 'Team 2') {
            return { team: raw };
        }
        const matchedUser = AppState.users.find((user) => (
            String(user?.id || '').trim() === raw
            || String(user?.name || '').trim() === raw
            || String(user?.email || '').trim() === raw
        ));
        if (matchedUser?.id) {
            return { ownerId: matchedUser.id };
        }
        return { historicalAssignee: raw };
    }

    async function refreshTodayOutcomeCountsFromBackend() {
        const today = new Date().toISOString().split('T')[0];
        const [dealPayload, coldPayload] = await Promise.all([
            DataService.fetchTaskPage({
                view: 'summary',
                status: 'DEAL',
                createdFrom: today,
                createdTo: today,
                page: 1,
                limit: 1,
            }),
            DataService.fetchTaskPage({
                view: 'summary',
                status: 'COLD',
                createdFrom: today,
                createdTo: today,
                page: 1,
                limit: 1,
            }),
        ]);

        const todayDealEl = document.getElementById('btnTodayDealCount');
        const todayColdEl = document.getElementById('btnTodayColdCount');
        if (todayDealEl) todayDealEl.innerText = dealPayload.total;
        if (todayColdEl) todayColdEl.innerText = coldPayload.total;
    }

    function resetAllTasksFilters() {
        const search = document.getElementById('allFilterBizName');
        const project = document.getElementById('filterAllTasksProject');
        const assignee = document.getElementById('filterAllTasksAssignee');
        const sort = document.getElementById('allTaskSort');
        if (search) search.value = '';
        if (project) project.value = '';
        if (assignee) assignee.value = '';
        if (sort) sort.value = 'newest';
        document.querySelectorAll('.all-status-filter').forEach((el) => {
            el.checked = false;
        });
        AppState.setPage('allTasks', 1);
    }

    async function renderMyTasks(options = {}) {
        const list = document.getElementById('myActiveTaskList');
        const pagination = document.getElementById('myTasksPagination');
        if (!list) return;
        const silent = Boolean(options?.silent);
        const previousScrollY = silent ? window.scrollY : null;
        if (!silent) {
            list.innerHTML = `<div class="no-tasks-message">Görevler yükleniyor...</div>`;
            if (pagination) pagination.innerHTML = '';
        }

        try {
            const me = AppState.loggedInUser || {};
            const query = {
                view: 'summary',
                generalStatus: 'OPEN',
                ownerId: me.id || '',
                q: String(document.getElementById('myFilterBizName')?.value || '').trim(),
                status: getSelectedTaskStatuses('.my-status-filter').join(','),
                source: document.getElementById('myTaskSourceFilter')?.value || '',
                sort: document.getElementById('myTaskSort')?.value || 'newest',
                page: AppState.pagination.myTasks || 1,
                limit: ITEMS_PER_PAGE_TASKS,
            };

            const payload = await DataService.fetchTaskPage(query);
            const countEl = document.getElementById('myActiveCount');
            if (countEl) countEl.innerText = payload.total;

            if (!payload.items.length && payload.total > 0 && payload.page > 1) {
                const lastPage = Math.max(1, Math.ceil(payload.total / Math.max(payload.limit || ITEMS_PER_PAGE_TASKS, 1)));
                AppState.setPage('myTasks', lastPage);
                return renderMyTasks(options);
            }

            if (!payload.items.length) {
                list.innerHTML = `<div class="no-tasks-message">Gösterilecek açık görev yok.</div>`;
                return;
            }

            mergeVisibleTasks(payload.items);
            list.innerHTML = '';
            payload.items.forEach((task) => list.appendChild(createMinimalCard(task)));

            if (pagination) {
                renderPagination(pagination, payload.total, payload.page, payload.limit, (nextPage) => {
                    AppState.setPage('myTasks', nextPage);
                    renderMyTasks();
                }, { compact: true, resultLabel: 'kayıt' });
            }
            if (silent && Number.isFinite(previousScrollY)) {
                requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, behavior: 'auto' }));
            }
        } catch (err) {
            console.error('My tasks backend list failed:', err);
            const countEl = document.getElementById('myActiveCount');
            if (countEl) countEl.innerText = '0';
            if (!silent) {
                list.innerHTML = `<div class="no-tasks-message">Görevler su anda yuklenemedi. Lutfen tekrar deneyin.</div>`;
            }
        }
    }

    async function renderAllTasks(options = {}) {
        const list = document.getElementById('allActiveTaskList');
        const pagContainer = document.getElementById('allTasksPagination');
        if (!list) return;
        const silent = Boolean(options?.silent);
        const previousScrollY = silent ? window.scrollY : null;
        if (!silent) {
            list.innerHTML = `<div class="no-tasks-message-empty">Açık görevler yükleniyor...</div>`;
            if (pagContainer) pagContainer.innerHTML = '';
        }

        try {
            const assigneeFilter = document.getElementById('filterAllTasksAssignee')?.value || '';
            const query = {
                view: 'summary',
                generalStatus: 'OPEN',
                q: String(document.getElementById('allFilterBizName')?.value || '').trim(),
                projectId: document.getElementById('filterAllTasksProject')?.value || '',
                status: getSelectedTaskStatuses('.all-status-filter').join(','),
                sort: document.getElementById('allTaskSort')?.value || 'newest',
                page: AppState.pagination.allTasks || 1,
                limit: ITEMS_PER_PAGE_TASKS,
                ...resolveTaskAssigneeQuery(assigneeFilter),
            };

            const [payload] = await Promise.all([
                DataService.fetchTaskPage(query),
                refreshTodayOutcomeCountsFromBackend().catch((err) => {
                    console.warn('Today outcome counts could not be refreshed from backend:', err);
                }),
                renderTeamPulse({ silent }).catch((err) => {
                    console.warn('Team pulse backend refresh failed:', err);
                }),
            ]);

            const countEl = document.getElementById('allActiveCount');
            if (countEl) countEl.innerText = payload.total;

            if (!payload.items.length && payload.total > 0 && payload.page > 1) {
                const lastPage = Math.max(1, Math.ceil(payload.total / Math.max(payload.limit || ITEMS_PER_PAGE_TASKS, 1)));
                AppState.setPage('allTasks', lastPage);
                return renderAllTasks(options);
            }

            if (!payload.items.length) {
                list.innerHTML = `<div class="no-tasks-message-empty">Açık görev bulunamadı.</div>`;
                return;
            }

            mergeVisibleTasks(payload.items);
            list.innerHTML = '';
            payload.items.forEach((task) => list.appendChild(createMinimalCard(task)));

            if (pagContainer) {
                renderPagination(pagContainer, payload.total, payload.page, payload.limit, (nextPage) => {
                    AppState.setPage('allTasks', nextPage);
                    renderAllTasks();
                }, { compact: true, resultLabel: 'kayıt' });
            }
            if (silent && Number.isFinite(previousScrollY)) {
                requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, behavior: 'auto' }));
            }
        } catch (err) {
            console.error('All tasks backend list failed:', err);
            const countEl = document.getElementById('allActiveCount');
            if (countEl) countEl.innerText = '0';
            if (!silent) {
                list.innerHTML = `<div class="no-tasks-message-empty">Acik gorevler su anda yuklenemedi. Lutfen tekrar deneyin.</div>`;
            }
        }
    }

    // --- Görev Modal & Inline Render ---
    async function openTaskModal(taskId, scrollToOffers = false) {
        let task = AppState.tasks.find(t => t.id === taskId);
        try {
            const freshTask = await DataService.readPath('tasks/' + taskId, { force: true });
            if (freshTask) {
                _updateTaskInState(freshTask);
                task = freshTask;
            }
        } catch (err) {
            if (err?.message === 'Task not found') {
                const removedTask = _removeTaskFromState(taskId, task);
                _refreshTaskViews(taskId);
                _refreshBusinessTaskHistory(removedTask?.businessId);
                task = null;
            }
            if (!task) {
                showToast('Gorev detayi yuklenemedi.', 'error');
                return;
            }
            console.warn('Task detail fetch failed, using cached task state.', err);
        }
        if (!task) return;
        window._openTaskModalId = taskId;
        const biz = AppState.getBizMap().get(task.businessId) || task;
        task.logs = task.logs || [];
        task.offers = task.offers || [];

        window._selectedModalStatus = '';
        window._selectedModalLogType = '';
        window._dealDetails = null;

        // --- LOGLARI AKILLICA AYRIŞTIRMA (Görüşme vs Sistem) ---
        const allInteractionLogs = [];
        const allSystemLogs = [...(task.systemLogs || [])];

        (task.logs || []).forEach(log => {
            const text = (log.text || '').trim();
            if (text.includes('[Deal Sonucu]')) {
                return;
            }
            let isSystem = false;

            // [Sistem], [Devir], [Klonlanmış Kampanya] her zaman Sistem Log'dur
            if (text.includes('[Sistem]') || text.includes('[Devir]') || text.includes('[Klonlanmış Kampanya]')) {
                isSystem = true;
            } 
            // Eğer log bir etiketle başlıyorsa (Örn: [Teklif Verildi])
            else if (/^\[(.*?)\]/.test(text.replace(/<[^>]*>?/gm, '').trim())) {
                const plainTextForTag = text.replace(/<[^>]*>?/gm, '').trim();
                const tagMatch = plainTextForTag.match(/^\[(.*?)\]/);
                const tag = tagMatch ? tagMatch[1] : '';
                const cleanText = plainTextForTag.replace(/^\[(.*?)\]/, '').trim();
                
                // Görev Notu ve Geçmiş Kayıt her zaman Görüşme Geçmişindedir
                if (tag === 'Görev Notu' || tag === 'Geçmiş Kayıt') {
                    isSystem = false;
                } else {
                    // Diğer etiketler (Tekrar Aranacak vb.) eğer yanında özel bir not yoksa Sistem Log'a düşer
                    if (!cleanText || (cleanText.startsWith('(') && cleanText.endsWith(')'))) {
                        isSystem = true;
                    } else {
                        // Yanında satışçının yazdığı özel not varsa Görüşme Geçmişinde kalır
                        isSystem = false;
                    }
                }
            } else {
                // Herhangi bir etiketi olmayan saf notlar da görüşme geçmişidir
                isSystem = false;
            }

            if (isSystem) {
                allSystemLogs.push(log);
            } else {
                allInteractionLogs.push(log);
            }
        });

        // Sistem loglarını tarihe göre yeniden sırala (en yeni en üstte)
        allSystemLogs.sort((a, b) => {
            const dateStrA = a.date.replace(/[^0-9]/g, '');
            const dateStrB = b.date.replace(/[^0-9]/g, '');
            return dateStrB.localeCompare(dateStrA);
        });

        const logsHTML = _buildTabbedLogsHTML(allInteractionLogs, allSystemLogs, task);
        const topBarHTML = _buildTaskModalTopBar(task, biz);
        
        const ma = document.getElementById('modalContentArea');
        if (!ma) return;

        ma.innerHTML = `
            ${topBarHTML}
            ${logsHTML}
            ${_buildActionBarHTML(task)}`;

        const tm = document.getElementById('taskModal');
        if (tm) { 
            tm.style.zIndex = '10002'; 
            tm.style.display = 'flex'; 
            // Drawer animasyonu için kısa bir gecikme ile active class'ı ekle
            setTimeout(() => {
                tm.classList.add('active');
            }, 10);
        }

        if (typeof window.initFlatpickr === 'function') window.initFlatpickr();

        if (scrollToOffers && task.offers.length > 0) {
            setTimeout(() => switchLogTab('offers', document.getElementById('tabBtnOffers')), 300);
        }
    }

    function renderTaskInline(taskId, containerId) {
        document.getElementById('modalContentArea').innerHTML = ''; 
        const taskDetail = typeof AppState.getTaskDetail === 'function' ? AppState.getTaskDetail(taskId) : null;
        const task = taskDetail || AppState.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.logs = task.logs || [];
        task.offers = task.offers || [];
        
        window._selectedModalStatus = ''; 
        window._selectedModalLogType = ''; 
        window._dealDetails = null;

        // --- LOGLARI AKILLICA AYRIŞTIRMA (Görüşme vs Sistem) ---
        const allInteractionLogs = [];
        const allSystemLogs = [...(task.systemLogs || [])];

        (task.logs || []).forEach(log => {
            const text = (log.text || '').trim();
            if (text.includes('[Deal Sonucu]')) {
                return;
            }
            let isSystem = false;

            if (text.includes('[Sistem]') || text.includes('[Devir]') || text.includes('[Klonlanmış Kampanya]')) {
                isSystem = true;
            } 
            // Eğer log bir etiketle başlıyorsa (Örn: [Teklif Verildi])
            else if (/^\[(.*?)\]/.test(text.replace(/<[^>]*>?/gm, '').trim())) {
                const plainTextForTag = text.replace(/<[^>]*>?/gm, '').trim();
                const tagMatch = plainTextForTag.match(/^\[(.*?)\]/);
                const tag = tagMatch ? tagMatch[1] : '';
                const cleanText = plainTextForTag.replace(/^\[(.*?)\]/, '').trim();
                
                // Görev Notu ve Geçmiş Kayıt her zaman Görüşme Geçmişindedir
                if (tag === 'Görev Notu' || tag === 'Geçmiş Kayıt') {
                    isSystem = false;
                } else {
                    // Diğer etiketler (Tekrar Aranacak vb.) eğer yanında özel bir not yoksa Sistem Log'a düşer
                    if (!cleanText || (cleanText.startsWith('(') && cleanText.endsWith(')'))) {
                        isSystem = true;
                    } else {
                        // Yanında satışçının yazdığı özel not varsa Görüşme Geçmişinde kalır
                        isSystem = false;
                    }
                }
            } else {
                // Herhangi bir etiketi olmayan saf notlar da görüşme geçmişidir
                isSystem = false;
            }

            if (isSystem) {
                allSystemLogs.push(log);
            } else {
                allInteractionLogs.push(log);
            }
        });

        // Sistem loglarını tarihe göre yeniden sırala (en yeni en üstte)
        allSystemLogs.sort((a, b) => {
            const dateStrA = a.date.replace(/[^0-9]/g, '');
            const dateStrB = b.date.replace(/[^0-9]/g, '');
            return dateStrB.localeCompare(dateStrA);
        });

        const logsHTML = _buildTabbedLogsHTML(allInteractionLogs, allSystemLogs, task);
        const container = document.getElementById(containerId);
        
        if (container) {
            container.innerHTML = `
                <div class="task-warning-box">
                    <span class="warning-icon">⚡</span> 
                    <div>Bu işletmenin şu an <b>${task.assignee}</b> üzerinde <b>${TASK_STATUS_LABELS[task.status] || task.status}</b> durumunda aktif bir görevi var. Aşağıdan doğrudan işlem yapabilirsiniz.</div>
                </div>
                ${logsHTML}
                ${_buildActionBarHTML(task)}
            `;
            if (typeof window.initFlatpickr === 'function') window.initFlatpickr();
        }
    }

    function _buildTabbedLogsHTML(userLogs, systemLogs, task) {
        const userLogsHtml = _buildTimelineHTML(userLogs, "Henüz görüşme kaydı veya işlem eklenmemiş.", task.id);
        const systemLogsHtml = _buildTimelineHTML(systemLogs, "Bu görev için henüz sistem logu bulunmuyor.", task.id);
        const offersHtml = _buildOffersHTML(task);

        return `
            <div class="log-tabs-container">
                <div class="tm-tabs-wrapper">
                    <button type="button" class="tm-tab-btn active" onclick="switchLogTab('user', this)">Görüşme Geçmişi (Log)</button>
                    <button type="button" class="tm-tab-btn" onclick="switchLogTab('system', this)">Sistem (Log)</button>
                    <button type="button" id="tabBtnOffers" class="tm-tab-btn" onclick="switchLogTab('offers', this)">Deal Detay</button>
                </div>
                <div class="tm-log-container">
                    <div id="logTabContent-user" class="log-tab-content" style="display:block;">${userLogsHtml}</div>
                    <div id="logTabContent-system" class="log-tab-content" style="display:none;">${systemLogsHtml}</div>
                    <div id="logTabContent-offers" class="log-tab-content" style="display:none;">${offersHtml}</div>
                </div>
            </div>
        `;
        if (typeof window.initFlatpickr === 'function') window.initFlatpickr();
    }

    function _buildTimelineHTML(logs, emptyMsg, taskId = null) {
        if (logs.length === 0) {
            return `<div style="color:var(--text-muted); font-size:13px; font-style:italic;">${emptyMsg}</div>`;
        }
        
        const currentUser = AppState.loggedInUser || {};
        const canManageAnyLog = ['Yönetici', 'Takım Lideri', 'Sistem Yöneticisi'].includes(currentUser.role);

        const groupedLogs = {};

        logs.forEach(log => {
            let datePart = log.date;
            let timePart = "";
            if (log.date.includes(' ')) {
                const parts = log.date.split(' ');
                datePart = parts[0];
                timePart = normalizeLogTimeLabel(parts.slice(1).join(' '));
            } else if (log.date.includes('T')) {
                const parts = log.date.split('T');
                datePart = parts[0];
                timePart = normalizeLogTimeLabel(parts[1]);
            }

            const groupKey = `${datePart}___${log.user}`;
            if (!groupedLogs[groupKey]) {
                groupedLogs[groupKey] = {
                    date: datePart,
                    user: log.user,
                    entries: []
                };
            }
            
            let tagSpanText = '';
            let cleanText = log.text;
            const plainText = cleanText.replace(/<[^>]*>?/gm, '').trim();
            const tagMatch = plainText.match(/^(\[[^\]]+\])\s*/);
            
            if (tagMatch) {
                let tagText = tagMatch[1].replace('[','').replace(']','');
                tagSpanText = `<span style="font-weight:700; font-size:11.5px; padding:2px 8px; border-radius:12px; background:rgba(15, 23, 42, 0.05); color:var(--primary-color);">${tagText}</span>`;
                cleanText = cleanText.replace(/<[^>]*>\[.*?\]<\/[^>]*>\s*/, '').replace(/^\[.*?\]\s*/, '').trim();
            }

            groupedLogs[groupKey].entries.push({
                id: log.id,
                authorId: log.authorId || '',
                time: timePart,
                tagSpan: tagSpanText,
                text: cleanText,
                rawText: log.text || '',
                fullDateOriginal: log.date
            });
        });

        const items = Object.values(groupedLogs).map(group => {
            let entriesHtml = group.entries.map((entry, index) => {
                const logIdArg = entry.id ? `'${entry.id}'` : `'${entry.fullDateOriginal}'`;
                const canManageEntry = Boolean(taskId) && (canManageAnyLog || (currentUser?.id && entry.authorId === currentUser.id));
                const encodedText = encodeURIComponent(entry.rawText || entry.text || '');
                const actionButtonsHtml = canManageEntry
                    ? `<div class="log-entry-actions">
                            <button class="log-entry-action-btn log-entry-edit-btn" onclick="editTaskLog('${taskId}', ${logIdArg}, '${encodedText}')" title="Bu Logu Düzenle" aria-label="Bu Logu Düzenle">✏️</button>
                            <button class="log-entry-action-btn log-entry-delete-btn" onclick="deleteTaskLog('${taskId}', ${logIdArg})" title="Bu Logu Sil" aria-label="Bu Logu Sil">🗑️</button>
                       </div>`
                    : '';
                const boStyle = index !== group.entries.length - 1 ? 'border-bottom:1px dashed #e2e8f0; padding-bottom:10px; margin-bottom:10px;' : '';

                return `
                <div class="log-entry-row${canManageEntry ? ' has-actions' : ''}" style="${boStyle}">
                    <div class="log-entry-main" style="display:block; color:var(--text-color); font-size:14px; line-height:1.6;">
                        <span style="font-size:13px; font-weight:bold; color:var(--text-muted); opacity:0.8;">${entry.time}</span>
                        ${entry.tagSpan ? `<span style="color:#cbd5e1; margin:0 5px;">-</span> ${entry.tagSpan} <span style="color:#cbd5e1; margin:0 5px;">-</span>` : `<span style="color:#cbd5e1; margin:0 6px;">-</span>`}
                        <span style="color:var(--text-color); font-weight:500;">${entry.text}</span>
                    </div>
                    ${actionButtonsHtml}
                </div>`;
            }).join('');

            return `
            <div class="modern-log-card" style="position:relative;">
                <div class="log-info-box-emerald">
                    <div class="log-date">${group.date}</div>
                    <div class="log-user">${group.user}</div>
                </div>
                <div class="log-text-box">
                    <div class="log-text-content" style="display:block; width:100%;">
                        ${entriesHtml}
                    </div>
                </div>
            </div>`;
        }).join('');

        return `<div class="log-scroll-container"><div style="display:flex; flex-direction:column; padding-bottom:10px;">${items}</div></div>`;
    }

    function switchLogTab(tab, btnElement) {
        document.querySelectorAll('.tm-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.log-tab-content').forEach(content => content.style.display = 'none');
        if (btnElement) btnElement.classList.add('active');
        const activeContent = document.getElementById('logTabContent-' + tab);
        if (activeContent) activeContent.style.display = 'block';
    }

    function _buildOffersHTML(task) {
        let dealSummaryHtml = '';

        if (task.status === 'deal' && task.dealDetails) {
            const d = task.dealDetails;
            dealSummaryHtml = `
            <div class="deal-summary-card">
                <h4>🤝 Anlaşma (Deal) Özeti</h4>
                <div class="deal-stats-grid">
                    <div class="deal-stat-item">
                        <span class="deal-stat-label">Komisyon</span>
                        <strong>%${d.commission}</strong>
                    </div>
                    <div class="deal-stat-item">
                        <span class="deal-stat-label">Süre</span>
                        <strong>${formatDealDurationDisplay(d.duration)}</strong>
                    </div>
                    <div class="deal-stat-item">
                        <span class="deal-stat-label">Yayın Bedeli</span>
                        <strong>${d.fee}</strong>
                    </div>
                    <div class="deal-stat-item">
                        <span class="deal-stat-label">Joker</span>
                        <strong>${d.joker}</strong>
                    </div>
                    <div class="deal-stat-item">
                        <span class="deal-stat-label">Kampanya</span>
                        <strong>${d.campCount}</strong>
                    </div>
                </div>
            </div>`;
        } else {
            dealSummaryHtml = '<div style="color:#888; font-size:13px; font-style:italic;">Bu görev henüz Deal olarak sonuçlanmamış.</div>';
        }

        return `<div id="taskOffersSection">${dealSummaryHtml}</div>`;
    }

    function _buildTaskModalTopBar(task, biz) {
        const user = AppState.loggedInUser;
        const canDelete = [USER_ROLES.MANAGER, USER_ROLES.TEAM_LEAD].includes(user.role);

        const resolvedContactDisplay = window.ContactParity?.resolveTaskContactDisplay
            ? window.ContactParity.resolveTaskContactDisplay(biz, task)
            : {
                name: task.specificContactName || biz.contactName,
                phone: task.specificContactPhone || biz.contactPhone,
                email: task.specificContactEmail || biz.contactEmail,
            };
        const actualName = resolvedContactDisplay.name;
        const actualPhone = resolvedContactDisplay.phone;
        const actualEmail = resolvedContactDisplay.email;

        const actualCampUrl = task.specificCampaignUrl || biz.campaignUrl;
        const webLink = biz.website ? (biz.website.startsWith('http') ? biz.website : 'http://' + biz.website) : '';
        const instaLink = biz.instagram ? (biz.instagram.startsWith('http') ? biz.instagram : 'https://instagram.com/' + biz.instagram.replace('@', '')) : '';

        let statusClass = 'cold';
        if(task.status === 'deal') statusClass = 'deal';
        if(task.status === 'hot') statusClass = 'hot';
        if(task.status === 'nothot') statusClass = 'nothot';
        const statusBadge = `<span class="tm-badge ${statusClass}">${TASK_STATUS_LABELS[task.status] || '-'}</span>`;

        const formatPhone = (p) => {
            if (!p) return '';
            let c = p.replace(/\D/g, '');
            if(c.length === 10 && !c.startsWith('0')) c = '0' + c;
            if(c.length === 11) return c.replace(/(\d{4})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
            return p;
        };

        let phoneHtml = '';
        if (actualPhone) {
            const pList = actualPhone.split(/[\/\-,|\\]/).map(p => p.trim()).filter(p => p.length >= 10);
            if (pList.length > 0) {
                if (pList.length === 1) {
                    phoneHtml = `<span class="tm-pill">📞 ${formatPhone(pList[0])}</span>`;
                } else {
                    const dId = 'tmDrop_' + Math.random().toString(36).substr(2,5);
                    const rItems = pList.slice(1).map((p) => `<div class="tm-phone-item">📞 ${formatPhone(p)}</div>`).join('');
                    phoneHtml = `<div class="tm-pill-dropdown-shell" style="position:relative; display:inline-block;"><button class="tm-pill clickable" onclick="const d = document.getElementById('${dId}'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; event.stopPropagation();">📞 ${formatPhone(pList[0])} ▾</button><div id="${dId}" class="tm-phone-menu animated-drop" style="display:none; position:absolute; top:100%; left:0; margin-top:8px; z-index:10000; min-width:180px;">${rItems}</div></div>`;
                }
            }
        }

        const emailList = (actualEmail || '').split(/[\n,;\/|\\]+/).map(e => e.trim()).filter(Boolean);
        let emailHtml = '';
        if (emailList.length === 1) {
            emailHtml = `<span class="tm-pill">✉️ ${emailList[0]}</span>`;
        } else if (emailList.length > 1) {
            const dId = 'tmMailDrop_' + Math.random().toString(36).substr(2,5);
            const rItems = emailList.slice(1).map((e) => `<div class="tm-phone-item">✉️ ${e}</div>`).join('');
            emailHtml = `<div class="tm-pill-dropdown-shell" style="position:relative; display:inline-block;"><button class="tm-pill clickable" onclick="const d = document.getElementById('${dId}'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; event.stopPropagation();">✉️ ${emailList[0]} ▾</button><div id="${dId}" class="tm-phone-menu animated-drop" style="display:none; position:absolute; top:100%; left:0; margin-top:8px; z-index:10000; min-width:220px;">${rItems}</div></div>`;
        }

        let contactBoxHtml = '';
        if (actualName || phoneHtml || actualEmail || webLink || instaLink || actualCampUrl) {
            contactBoxHtml = `
            <div class="tm-contact-box">
                <div class="tm-contact-row">
                ${actualName ? `<span class="tm-pill">👤 ${actualName}</span>` : ''}
                ${phoneHtml}
                ${emailHtml}
                ${webLink ? `<a href="${webLink}" target="_blank" class="tm-pill clickable action">🌍 Web Sitesi</a>` : ''}
                ${instaLink ? `<a href="${instaLink}" target="_blank" class="tm-pill clickable action">📸 Instagram</a>` : ''}
                ${actualCampUrl ? `<a href="${actualCampUrl}" target="_blank" class="tm-pill clickable action">🔗 Kampanya Linki</a>` : ''}
                </div>
            </div>`;
        }

        return `
        <div class="tm-header-card">
            <div class="tm-header-actions" style="position: absolute; top: 15px; right: 15px; display: flex; gap: 8px; z-index: 10;">
                ${canDelete ? `<button class="premium-icon-btn delete-btn" onclick="deleteTask('${task.id}')" title="Görevi Sil">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>` : ''}
                <button class="premium-icon-btn close-btn" onclick="closeModal('taskModal')" title="Kapat">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div class="tm-header-content" style="padding-right: 85px;">
                <div class="tm-header-intro" style="display:flex; flex-direction:column; gap:10px; margin-bottom:15px;">
                    <div class="tm-title-row" style="margin-bottom:0;">
                        <h2 class="tm-title" style="cursor:pointer; transition:0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'" onclick="closeModal('taskModal'); openBusinessDetailModal('${task.businessId}')" title="İşletme Detaylarını Görüntüle">
                            ${biz.companyName || '-'}
                        </h2>
                        <div class="tm-badge-group">
                            ${statusBadge}
                            <span class="tm-badge">📁 ${task.sourceType || '-'}</span>
                            <span class="tm-badge">👤 ${task.assignee || '-'}</span>
                            <span class="tm-badge">📍 ${biz.city || '-'}</span>
                            <span class="tm-badge">📁 ${task.mainCategory || '-'}${task.subCategory ? ' > ' + task.subCategory : ''}</span>
                        </div>
                    </div>
                </div>
                ${contactBoxHtml}
            </div>
        </div>`;
    }

    function _canReassignTask(task) {
        if (!task) return false;
        if (task.status === 'pending_approval' || !isActiveTask(task.status)) return false;
        if (typeof window.hasPermission === 'function' && !window.hasPermission('reassignTask')) return false;
        const user = AppState.loggedInUser || {};
        return [USER_ROLES.MANAGER, USER_ROLES.TEAM_LEAD].includes(user.role);
    }

    function _getTransferCandidates(task) {
        const currentUser = AppState.loggedInUser || {};
        const currentOwnerId = String(task?.ownerId || '').trim();
        const currentOwnerName = String(task?.assignee || '').trim();

        let users = (AppState.users || []).filter((user) => {
            if (!user) return false;
            if (user.status === 'Pasif') return false;
            if (user.role !== USER_ROLES.SALES_REP) return false;
            const sameById = currentOwnerId && user.id && user.id === currentOwnerId;
            const sameByName = currentOwnerName && user.name && user.name === currentOwnerName;
            return !(sameById || sameByName);
        });

        if (currentUser.role === USER_ROLES.TEAM_LEAD && currentUser.team && currentUser.team !== '-') {
            users = users.filter((user) => user.team === currentUser.team);
        }

        return users;
    }

    function _buildTransferCandidateOptions(task) {
        const activeTasks = (AppState.tasks || []).filter((entry) => isActiveTask(entry.status));
        return _getTransferCandidates(task).map((user) => {
            const workload = activeTasks.filter((entry) => {
                if (user.id && entry.ownerId) return entry.ownerId === user.id;
                return entry.assignee === user.name;
            }).length;
            const teamLabel = user.team && user.team !== '-' ? user.team : 'Merkez';
            const statusLine = `${teamLabel} • ${workload} açık görev`;
            return `<option value="${user.id}" data-summary="${statusLine}">${user.name} • ${statusLine}</option>`;
        }).join('');
    }

    // EKSİK OLAN AKSİYON BAR FONKSİYONU EKLENDİ!
    function _buildActionBarHTML(task) {
        const isPending = task.status === 'pending_approval';
        const pendingWarning = isPending ? `<div style="background:#fff3cd; color:#856404; padding:15px; border-radius:12px; margin-bottom:20px; font-size:14px; border:1px solid #ffeeba;">⏳ <b>Onay bekleniyor.</b> Yönetici onaylayana kadar bu görev üzerinde işlem yapamazsınız.</div>` : '';
        const actionDisplay = isPending ? 'display:none !important;' : 'display:flex;';
        const transferButtonHtml = _canReassignTask(task)
            ? `<button type="button" class="status-chip task-transfer-chip" onclick="openTaskTransferModal('${task.id}')" style="background:rgba(14,116,144,0.18); border-color:rgba(125,211,252,0.35); color:#cffafe;">↔️ Görev Devri</button>`
            : '';
        const transferOptionsHtml = _buildTransferCandidateOptions(task);
        const transferCurrentOwner = task.assignee || 'Havuz';
        const durationValue = Number(task.durationDays || 7);

        return `
        ${pendingWarning}
        
        <div class="floating-action-bar" style="${isPending ? 'display:none !important;' : ''}">
            <div class="floating-status-strip" style="${actionDisplay} align-items:center; gap:8px; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; flex-shrink:0;">
                <button type="button" class="status-chip" onclick="selectModalStatus('hot', this)">🔥 Hot</button>
                <button type="button" class="status-chip" onclick="selectModalStatus('nothot', this)">⚠️ Not Hot</button>
                <button type="button" class="status-chip" onclick="selectModalStatus('cold', this)">❄️ Cold</button>
                <button type="button" class="status-chip" onclick="selectModalStatus('deal', this)" style="border-color:var(--success-color); color:var(--success-color); background:rgba(16,185,129,0.1);">🤝 Deal</button>
                <button type="button" class="status-chip" onclick="openContactUpdateModal('${task.id}')" style="background:rgba(15,118,110,0.2); border-color:rgba(15,118,110,0.4); color:#a7f3d0;">👤 İletişim Ekle</button>
                ${transferButtonHtml}
            </div>
            
            <div class="floating-action-divider desktop-only-divider" style="width:1px; height:30px; background:rgba(255,255,255,0.3); ${actionDisplay} margin:0 5px; flex-shrink:0;"></div>
            
            <div class="floating-result-select" style="position:relative; width:auto; ${actionDisplay} flex-shrink:0;">
                <button type="button" id="btnCustomLogType" class="custom-dropdown-btn" onclick="toggleCustomLogTypeMenu(event)">⚡ Sonuç Seç...</button>
                <div id="customLogTypeMenu" class="mac-popover animated-drop" style="display:none;">
                    <div onclick="selectModalLogType('İşletmeye Ulaşılamadı', '📵 Ulaşılamadı')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                        Ulaşılamadı
                    </div>
                    <div onclick="selectModalLogType('Yetkiliye Ulaşılamadı', '🤷‍♂️ Yetkili Yok')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5c-1.2 0-2 .8-2 2v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                        Yetkiliye Ulaşılamadı
                    </div>
                    <div onclick="selectModalLogType('Yetkiliye Ulaşıldı', '🗣️ Ulaşıldı')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        Yetkiliye Ulaşıldı
                    </div>
                    <div onclick="selectModalLogType('İşletme Çalışmak İstemiyor', '🛑 İstemiyor')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                        İstemiyor
                    </div>
                    <div onclick="selectModalLogType('İşletme Kapanmış', '🚫 Kapalı/Pasif')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
                        İşletme Kapanmış
                    </div>
                    <div onclick="selectModalLogType('Tekrar Aranacak', '🕒 Tekrar Ara')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        Tekrar Aranacak
                    </div>
                </div>
            </div>

            <div class="floating-input-wrapper">
                <input type="text" id="modalLogInput" placeholder="Görüşme notunuzu yazmak için tıklayın..." readonly onclick="openTaskNoteComposer()">
            </div>
            
            <button id="btnSaveModalLog" onclick="triggerSaveAction('${task.id}')">Kaydet 🚀</button>
        </div>

        <div id="miniModalOverlay" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15, 23, 42, 0.6); backdrop-filter:blur(5px); z-index:100100; align-items:center; justify-content:center;">
            
            <div id="miniModalDate" class="followup-modal-shell" style="display:none;">
                <div class="followup-modal-head">
                    <div class="followup-modal-copy">
                        <h3 class="followup-modal-title">🕒 Tekrar Arama Planı</h3>
                        <p class="followup-modal-subtitle">Hızlı seçim yapın veya takvimden tarih-saat belirleyin.</p>
                    </div>
                </div>
                <div class="followup-composer-grid">
                    <div class="followup-composer-pane">
                        <span class="followup-pane-title">Hızlı planlar</span>
                        <div class="followup-quick-grid">
                            <button type="button" class="followup-quick-btn" onclick="pickQuickFollowup(0, 16, 0, this)">Bugün 16:00</button>
                            <button type="button" class="followup-quick-btn" onclick="pickQuickFollowup(1, 10, 0, this)">Yarın 10:00</button>
                            <button type="button" class="followup-quick-btn" onclick="pickQuickFollowup(1, 14, 0, this)">Yarın 14:00</button>
                            <button type="button" class="followup-quick-btn" onclick="pickQuickFollowup(3, 11, 0, this)">3 Gün Sonra</button>
                            <button type="button" class="followup-quick-btn" onclick="pickQuickFollowup(7, null, 0, this)">Haftaya Aynı Saat</button>
                        </div>
                    </div>
                    <div id="followupCalendarPane" class="followup-composer-pane followup-composer-pane--calendar">
                        <span class="followup-pane-title">Takvim ve saat</span>
                        <div class="premium-input-wrapper followup-picker-field">
                            <input type="text" id="flatpickrInput" class="followup-flatpickr-input" placeholder="Tarih ve Saat Seçin">
                        </div>
                        <div id="followupPickerMount" class="followup-picker-mount" aria-hidden="true"></div>
                        <textarea id="followupReasonNote" class="modern-capsule-input followup-note-input" placeholder="Opsiyonel not: neden tekrar aranacak?"></textarea>
                    </div>
                </div>
                <div id="followupSelectionSummary" class="followup-summary-box">Henüz tarih seçilmedi.</div>
                <div class="followup-modal-footer">
                    <button id="followupPlanBtn" class="followup-action-btn followup-action-btn--primary" onclick="executeSaveAction('${task.id}')" disabled>Planla</button>
                    <button class="followup-action-btn followup-action-btn--secondary" onclick="closeMiniModal()">İptal</button>
                </div>
            </div>

            <div id="miniModalDeal" class="tm-mini-panel tm-mini-panel--deal" style="display:none; background:#fff; border-radius:16px; padding:25px; box-shadow:0 15px 50px rgba(0,0,0,0.15); width:90%; max-width:450px; border-top:4px solid var(--success-color);">
                <h3 style="margin:0 0 15px 0; color:var(--secondary-color);">🤝 Deal Sonucu Detayları</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="premium-input-wrapper"><span class="input-icon">%</span><input type="number" id="dealCommission" placeholder="Komisyon *" min="0"></div>
                    <div class="premium-input-wrapper"><span class="input-icon">⏱️</span><input type="number" id="dealDuration" placeholder="Yayın Süresi (Ay) *" min="1"></div>
                    <div class="premium-input-wrapper"><span class="input-icon">₺</span><input type="number" id="dealFee" placeholder="Yayın Bedeli" min="0"></div>
                    <div class="premium-input-wrapper"><span class="input-icon">🎟️</span><input type="number" id="dealJoker" placeholder="Joker" min="0"></div>
                    <div class="premium-input-wrapper full-width" style="grid-column:1/-1;"><span class="input-icon">📦</span><input type="number" id="dealCampCount" placeholder="Kampanya Adeti *" min="1"></div>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button onclick="executeDealSaveAction('${task.id}')" style="background:var(--success-color); flex:1; border:none; padding:12px; color:#fff; border-radius:8px; font-weight:bold; cursor:pointer;">Anlaşmayı Kaydet</button>
                    <button onclick="closeMiniModal()" style="background:#e2e8f0; color:#475569; flex:1; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer;">İptal</button>
                </div>
            </div>

            <div id="miniModalContact" class="tm-mini-panel tm-mini-panel--contact" style="display:none; background:#fff; border-radius:16px; padding:25px; box-shadow:0 15px 50px rgba(0,0,0,0.15); width:90%; max-width:400px; border-top:4px solid var(--info-color);">
                <h3 style="margin:0 0 10px 0; color:var(--secondary-color);">👤 İletişim Bilgisi Ekle</h3>
                <p style="font-size:12px; color:var(--text-muted); margin-bottom:15px; line-height:1.4;">Girdiğiniz bilgiler mevcut bilgilerle akıllıca birleştirilecektir.</p>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div class="premium-input-wrapper"><input type="text" id="updTaskContactName" placeholder="Yetkili İsim (Opsiyonel)" style="padding-left:15px !important;"></div>
                    <div class="premium-input-wrapper"><span class="input-icon">📞</span><input type="tel" id="updTaskContactPhone" placeholder="Telefon Numarası"></div>
                    <div class="premium-input-wrapper"><span class="input-icon">✉️</span><input type="email" id="updTaskContactEmail" placeholder="E-Posta Adresi"></div>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button onclick="executeContactUpdate('${task.id}')" style="background:var(--info-color); flex:1; border:none; padding:12px; color:#fff; border-radius:8px; font-weight:bold; cursor:pointer;">Kaydet</button>
                    <button onclick="closeMiniModal()" style="background:#e2e8f0; color:#475569; flex:1; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer;">İptal</button>
                </div>
            </div>

            <div id="miniModalTransfer" style="display:none; background:#fff; border-radius:18px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.16); width:min(92vw, 560px); border-top:4px solid #0f766e;">
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                    <h3 style="margin:0; color:var(--secondary-color);">↔️ Görev Devri</h3>
                    <p style="margin:0; font-size:13px; color:#64748b; line-height:1.5;">Görevi yeni sorumluya aktarın. Takım liderleri yalnızca kendi takımları içinde devredebilir.</p>
                </div>
                <div class="task-transfer-shell">
                    <div class="task-transfer-meta">
                        <div class="task-transfer-stat">
                            <span class="task-transfer-label">Mevcut Sorumlu</span>
                            <strong>${transferCurrentOwner}</strong>
                        </div>
                        <div class="task-transfer-stat">
                            <span class="task-transfer-label">Görev Süresi</span>
                            <strong>${durationValue} gün</strong>
                        </div>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Yeni Sorumlu</label>
                        <select id="taskTransferOwnerId" onchange="refreshTaskTransferSummary()">
                            <option value="">Kişi seçin</option>
                            ${transferOptionsHtml}
                        </select>
                    </div>
                    <div id="taskTransferSummary" class="task-transfer-summary">${transferOptionsHtml ? 'Hedef kişi seçildiğinde takım ve iş yükü burada görünür.' : 'Bu görev için uygun devir adayı bulunamadı.'}</div>
                    <div class="form-grid" style="grid-template-columns: 150px minmax(0, 1fr); gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label>Süre (gün)</label>
                            <input type="number" id="taskTransferDuration" min="1" value="${durationValue}">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label>Devir Notu</label>
                            <textarea id="taskTransferNote" rows="3" placeholder="Opsiyonel not: müşteri geçmişi, öncelik ya da dikkat edilmesi gereken nokta..."></textarea>
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:18px;">
                    <button id="taskTransferConfirmBtn" onclick="executeTaskTransfer('${task.id}')" style="background:#0f766e; flex:1; border:none; padding:12px; color:#fff; border-radius:10px; font-weight:700; cursor:pointer;" ${transferOptionsHtml ? '' : 'disabled'}>Görevi Devret</button>
                    <button onclick="closeMiniModal()" style="background:#e2e8f0; color:#475569; flex:1; border:none; padding:12px; border-radius:10px; font-weight:700; cursor:pointer;">İptal</button>
                </div>
            </div>

            <div id="miniModalComposer" class="tm-mini-panel tm-composer-panel" style="display:none; background:#fff; border-radius:20px; padding:26px; box-shadow:0 24px 70px rgba(15,23,42,0.24); width:min(92vw, 760px); border:1px solid rgba(148,163,184,0.24);">
                <div class="task-composer-header" style="display:flex; flex-direction:column; gap:8px; margin-bottom:18px;">
                    <span style="font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#0f766e;">Görüşme Notu</span>
                    <h3 style="margin:0; color:#0f172a; font-size:24px; font-weight:800; letter-spacing:-0.02em;">Mesaj kutusunda rahatça yazın</h3>
                    <p style="margin:0; color:#64748b; font-size:14px; line-height:1.6;">Uzun görüşme notlarını tek satır yerine geniş bir yazım alanında hazırlayın. İsterseniz kutuyu daha da büyütebilirsiniz.</p>
                </div>
                <textarea id="modalLogComposerTextarea" class="task-composer-textarea" placeholder="Görüşme notlarınızı detaylı şekilde buraya yazın..." style="width:100%; min-height:220px; resize:vertical; box-sizing:border-box; padding:18px 20px; border-radius:16px; border:1px solid #cbd5e1; background:linear-gradient(180deg, #f8fafc 0%, #ffffff 100%); font-size:15px; line-height:1.7; color:#0f172a; outline:none; box-shadow:inset 0 1px 2px rgba(15,23,42,0.05);" oninput="syncTaskComposerValue(this.value)"></textarea>
                <div class="task-composer-actions" style="display:flex; gap:10px; justify-content:flex-end; margin-top:18px;">
                    <button type="button" onclick="closeTaskNoteComposer(false)" style="background:#e2e8f0; color:#475569; border:none; padding:12px 18px; border-radius:10px; font-weight:700; cursor:pointer;">İptal</button>
                    <button type="button" onclick="closeTaskNoteComposer(true)" style="background:linear-gradient(135deg, #0f766e 0%, #115e59 100%); color:#fff; border:none; padding:12px 18px; border-radius:10px; font-weight:700; cursor:pointer;">Tamam</button>
                </div>
            </div>
        </div>
        `;
    }

    // --- Aksiyon & Kaydetme (Yeni Mimari) ---
    function selectModalStatus(status, el) {
        window._selectedModalStatus = status;
        document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
        if (el) el.classList.add('active');
    }

    function toggleCustomLogTypeMenu(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('customLogTypeMenu');
        if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }

    function syncTaskComposerValue(value = '') {
        const normalized = String(value || '');
        const inlineInput = document.getElementById('modalLogInput');
        const composerTextarea = document.getElementById('modalLogComposerTextarea');
        if (inlineInput) {
            inlineInput.value = normalized;
            inlineInput.setAttribute('data-has-value', normalized.trim() ? '1' : '0');
        }
        if (composerTextarea && composerTextarea.value !== normalized) {
            composerTextarea.value = normalized;
        }
    }

    function openTaskNoteComposer() {
        const overlay = document.getElementById('miniModalOverlay');
        const composer = document.getElementById('miniModalComposer');
        const inlineInput = document.getElementById('modalLogInput');
        const composerTextarea = document.getElementById('modalLogComposerTextarea');
        if (!overlay || !composer || !composerTextarea) return;

        if (document.getElementById('miniModalDeal')) document.getElementById('miniModalDeal').style.display = 'none';
        if (document.getElementById('miniModalDate')) document.getElementById('miniModalDate').style.display = 'none';
        if (document.getElementById('miniModalContact')) document.getElementById('miniModalContact').style.display = 'none';
        if (document.getElementById('miniModalTransfer')) document.getElementById('miniModalTransfer').style.display = 'none';

        composerTextarea.value = inlineInput?.value || '';
        overlay.style.display = 'flex';
        composer.style.display = 'block';

        setTimeout(() => {
            composerTextarea.focus();
            composerTextarea.setSelectionRange(composerTextarea.value.length, composerTextarea.value.length);
        }, 0);
    }

    function closeTaskNoteComposer(applyValue = false) {
        const composer = document.getElementById('miniModalComposer');
        const composerTextarea = document.getElementById('modalLogComposerTextarea');
        if (applyValue && composerTextarea) {
            syncTaskComposerValue(composerTextarea.value);
        }
        if (composer) composer.style.display = 'none';
        closeMiniModal();
    }

    function refreshFollowupSummary(dateStr = '') {
        const planBtn = document.getElementById('followupPlanBtn');
        const summary = document.getElementById('followupSelectionSummary');
        if (planBtn) planBtn.disabled = !dateStr;
        if (summary) {
            summary.innerHTML = dateStr
                ? `<strong>Seçilen plan:</strong> ${formatDate(dateStr)}`
                : 'Henüz tarih seçilmedi.';
        }
    }

    function markActiveQuickFollowup(activeButton = null) {
        document.querySelectorAll('#miniModalDate .followup-quick-btn').forEach((button) => {
            button.classList.toggle('active', !!activeButton && button === activeButton);
        });
    }

    function pickQuickFollowup(dayOffset = 1, hour = null, minute = 0, buttonEl = null) {
        const next = new Date();
        next.setSeconds(0, 0);
        next.setDate(next.getDate() + Number(dayOffset || 0));
        const resolvedHour = hour == null ? next.getHours() : Number(hour || 0);
        const resolvedMinute = hour == null ? next.getMinutes() : Number(minute || 0);
        next.setHours(resolvedHour, resolvedMinute, 0, 0);
        markActiveQuickFollowup(buttonEl);
        if (window.fpInstance) {
            window._isApplyingQuickFollowup = true;
            window.fpInstance.setDate(next, true);
            window._isApplyingQuickFollowup = false;
        } else {
            const input = document.getElementById('flatpickrInput');
            if (input) {
                const pad = (value) => String(value).padStart(2, '0');
                input.value = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())} ${pad(next.getHours())}:${pad(next.getMinutes())}`;
            }
        }
        refreshFollowupSummary(document.getElementById('flatpickrInput')?.value || '');
    }

    function selectModalLogType(val, label) {
        window._selectedModalLogType = val;
        const btn = document.getElementById('btnCustomLogType');
        if (btn) { btn.innerHTML = label; btn.classList.add('selected'); }
        const menu = document.getElementById('customLogTypeMenu');
        if (menu) menu.style.display = 'none';

        if (val === 'Tekrar Aranacak') {
            document.getElementById('miniModalOverlay').style.display = 'flex';
            
            // Diğer tüm modalları kapat (Garanti Kuralı)
            if (document.getElementById('miniModalDeal')) document.getElementById('miniModalDeal').style.display = 'none';
            if (document.getElementById('miniModalContact')) document.getElementById('miniModalContact').style.display = 'none';
            if (document.getElementById('miniModalComposer')) document.getElementById('miniModalComposer').style.display = 'none';
            
            document.getElementById('miniModalDate').style.display = 'block';
            markActiveQuickFollowup(null);
            if (typeof window.initFlatpickr === 'function') {
                window.initFlatpickr();
                
                // Varsa eski tarihi takvime yerleştir
                const btnSave = document.getElementById('btnSaveModalLog');
                if (btnSave) {
                    const match = btnSave.getAttribute('onclick').match(/'([^']+)'/);
                    if (match && match[1]) {
                        const task = AppState.tasks.find(t => t.id === match[1]);
                        if (task && task.nextCallDate && window.fpInstance) {
                            window.fpInstance.setDate(task.nextCallDate);
                        }
                    }
                }
            }
            refreshFollowupSummary(document.getElementById('flatpickrInput')?.value || '');
        }
    }

    function triggerSaveAction(taskId) {
        const taskDetail = typeof AppState.getTaskDetail === 'function' ? AppState.getTaskDetail(taskId) : null;
        const task = taskDetail || AppState.tasks.find(t => t.id === taskId);
        if (!task) return;

        const logType = window._selectedModalLogType || '';
        const newStatus = window._selectedModalStatus || '';
        const logText = document.getElementById('modalLogInput')?.value.trim() || '';

        if (newStatus !== 'deal' && !logType) {
            return showToast("Lütfen öncelikle durum sonucunu (Örn: Ulaşılamadı, Ulaşıldı) seçin!", 'warning');
        }

        if (logType && logType !== 'Tekrar Aranacak' && !newStatus && task.status === 'new') {
            return showToast("Lütfen yeni bir 'Durum' (Örn: Hot, Not Hot) seçin!", 'warning');
        }
        if (!logType && !newStatus && !logText) {
            return showToast("Kaydedilecek bir işlem girmediniz.", 'warning');
        }

        if (logType === 'İşletme Kapanmış') {
            askConfirm("Bu işletmenin kapandığını onaylıyor musunuz? İşletme PASİFE çekilecek ve bu görev COLD olarak kapatılacaktır.", (res) => {
                if (res) {
                    window._selectedModalStatus = 'cold';
                    this.executeSaveAction(taskId);
                }
            });
            return;
        }

        if (newStatus === 'deal') {
            document.getElementById('miniModalOverlay').style.display = 'flex';
            document.getElementById('miniModalDeal').style.display = 'block';
            document.getElementById('miniModalDate').style.display = 'none';
            return; 
        }

        if (logType === 'Tekrar Aranacak') {
            selectModalLogType(logType, '🕒 Tekrar Ara');
        } else {
            executeSaveAction(taskId);
        }
    }

    function openContactUpdateModal(taskId) {
        document.getElementById('updTaskContactName').value = '';
        document.getElementById('updTaskContactPhone').value = '';
        document.getElementById('updTaskContactEmail').value = '';
        
        document.getElementById('miniModalOverlay').style.display = 'flex';
        document.getElementById('miniModalContact').style.display = 'block';
        if(document.getElementById('miniModalDeal')) document.getElementById('miniModalDeal').style.display = 'none';
        if(document.getElementById('miniModalDate')) document.getElementById('miniModalDate').style.display = 'none';
        if(document.getElementById('miniModalComposer')) document.getElementById('miniModalComposer').style.display = 'none';
    }

    function refreshTaskTransferSummary() {
        const select = document.getElementById('taskTransferOwnerId');
        const summary = document.getElementById('taskTransferSummary');
        if (!select || !summary) return;
        const selectedOption = select.options[select.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            summary.innerHTML = 'Hedef kişi seçildiğinde takım ve iş yükü burada görünür.';
            return;
        }
        const meta = selectedOption.getAttribute('data-summary') || '';
        summary.innerHTML = `<strong>${selectedOption.textContent.split('•')[0].trim()}</strong><span>${meta}</span>`;
    }

    function openTaskTransferModal(taskId) {
        const task = AppState.tasks.find((entry) => entry.id === taskId);
        if (!task) return;
        if (!isActiveTask(task.status)) {
            showToast('Kapalı görevler devredilemez.', 'warning');
            return;
        }
        if (!_canReassignTask(task)) {
            showToast('Bu görevi devretme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        if (_getTransferCandidates(task).length === 0) {
            showToast('Bu görev için uygun aktif kullanıcı bulunamadı.', 'warning');
            return;
        }
        document.getElementById('miniModalOverlay').style.display = 'flex';
        if (document.getElementById('miniModalDeal')) document.getElementById('miniModalDeal').style.display = 'none';
        if (document.getElementById('miniModalDate')) document.getElementById('miniModalDate').style.display = 'none';
        if (document.getElementById('miniModalContact')) document.getElementById('miniModalContact').style.display = 'none';
        if (document.getElementById('miniModalComposer')) document.getElementById('miniModalComposer').style.display = 'none';
        if (document.getElementById('miniModalTransfer')) document.getElementById('miniModalTransfer').style.display = 'block';
        refreshTaskTransferSummary();
    }

    async function executeTaskTransfer(taskId) {
        const task = AppState.tasks.find((entry) => entry.id === taskId);
        if (!task) return;
        if (!isActiveTask(task.status)) {
            return showToast('Kapalı görevler devredilemez.', 'warning');
        }
        const ownerSelect = document.getElementById('taskTransferOwnerId');
        const durationInput = document.getElementById('taskTransferDuration');
        const noteInput = document.getElementById('taskTransferNote');
        const btn = document.getElementById('taskTransferConfirmBtn');
        const ownerId = ownerSelect?.value || '';
        const durationDays = Number(durationInput?.value || task.durationDays || 7);
        const note = esc(noteInput?.value || '');

        if (!ownerId) return showToast('Lütfen görevi devredeceğiniz kişiyi seçin.', 'warning');
        if (!Number.isFinite(durationDays) || durationDays < 1) return showToast('Görev süresi en az 1 gün olmalıdır.', 'warning');

        if (btn) {
            btn.disabled = true;
            btn.innerText = '⏳ Devrediliyor...';
        }

        try {
            await DataService.apiRequest(`/tasks/${taskId}/assign`, {
                method: 'POST',
                body: JSON.stringify({
                    ownerId,
                    durationDays,
                    note: note || undefined,
                }),
            });
            const refreshedTask = await DataService.readPath(`tasks/${taskId}`, { force: true });
            _updateTaskInState(refreshedTask);
            closeMiniModal();
            _refreshTaskViews(taskId);
            showToast('Görev başarıyla devredildi.', 'success');
        } catch (err) {
            console.error('Görev devri hatası:', err);
            const message = String(err?.message || '').trim();
            if (message.toLocaleLowerCase('tr-TR').includes('closed tasks cannot be reassigned')) {
                showToast('Kapalı görevler devredilemez.', 'warning');
            } else {
                showToast(`Görev devri başarısız: ${message || 'Bilinmeyen hata'}`, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Görevi Devret';
            }
        }
    }

    async function executeContactUpdate(taskId) {
        const taskDetail = typeof AppState.getTaskDetail === 'function' ? AppState.getTaskDetail(taskId) : null;
        const task = taskDetail || AppState.tasks.find(t => t.id === taskId);
        if (!task) return;

        const newName = esc(document.getElementById('updTaskContactName').value.trim());
        const newPhone = esc(document.getElementById('updTaskContactPhone').value.trim());
        const newEmail = esc(document.getElementById('updTaskContactEmail').value.trim().toLowerCase());

        if (!newPhone && !newEmail) {
            return showToast("Lütfen en az bir telefon veya e-posta girin!", "warning");
        }

        try {
            await DataService.apiRequest(`/tasks/${taskId}/focus-contact`, {
                method: 'POST',
                body: JSON.stringify({
                    name: newName || undefined,
                    phone: newPhone || undefined,
                    email: newEmail || undefined
                })
            });

            showToast("İletişim bilgisi başarıyla eklendi!", "success");
            closeMiniModal();
            
            const [refreshedTask, refreshedBiz] = await Promise.all([
                DataService.readPath('tasks/' + taskId, { force: true }).catch(() => null),
                DataService.readPath('accounts/' + task.businessId, { force: true }).catch(() => null),
            ]);

            _updateTaskInState(refreshedTask);
            _updateBusinessInState(refreshedBiz);
            
            if (document.getElementById('inlineTaskContainer')) {
                if (window.renderTaskInline) window.renderTaskInline(taskId, 'inlineTaskContainer');
            } else {
                openTaskModal(taskId);
            }
        } catch (err) {
            console.error('İletişim bilgisi kayıt hatası:', err);
            showToast(`Güncelleme sırasında hata oluştu: ${err.message}`, "error");
        }
    }

    function closeMiniModal() {
        const overlay = document.getElementById('miniModalOverlay');
        if (overlay) overlay.style.display = 'none';
        if (window.fpInstance) {
            window.fpInstance.close();
        }
        const calendarPane = document.getElementById('followupCalendarPane');
        if (calendarPane) {
            calendarPane.classList.remove('followup-calendar-open');
        }

        // Durum Sızıntısını (State Leakage) Önlemek İçin Tüm İç Modalları Güvenli Kapatma
        if (document.getElementById('miniModalDeal')) document.getElementById('miniModalDeal').style.display = 'none';
        if (document.getElementById('miniModalDate')) document.getElementById('miniModalDate').style.display = 'none';
        if (document.getElementById('miniModalContact')) document.getElementById('miniModalContact').style.display = 'none';
        if (document.getElementById('miniModalTransfer')) document.getElementById('miniModalTransfer').style.display = 'none';
        if (document.getElementById('miniModalComposer')) document.getElementById('miniModalComposer').style.display = 'none';
        const noteEl = document.getElementById('followupReasonNote');
        if (noteEl) noteEl.value = '';
        const transferNoteEl = document.getElementById('taskTransferNote');
        if (transferNoteEl) transferNoteEl.value = '';
        const transferSelect = document.getElementById('taskTransferOwnerId');
        if (transferSelect) transferSelect.value = '';
        markActiveQuickFollowup(null);
        refreshFollowupSummary('');
        refreshTaskTransferSummary();
    }

    function executeDealSaveAction(taskId) {
        const comm = document.getElementById('dealCommission')?.value.trim();
        const duration = document.getElementById('dealDuration')?.value.trim();
        let fee = document.getElementById('dealFee')?.value.trim() || 'Yok';
        const joker = document.getElementById('dealJoker')?.value.trim() || 'Yok';
        const campCount = document.getElementById('dealCampCount')?.value.trim();

        if (!comm || !duration || !campCount) return showToast("Komisyon, Yayın Süresi ve Kampanya Adeti zorunludur!", "error");

        const isBedelsiz = (fee.toLowerCase() === 'yok' || fee === '0' || fee === '0 tl' || fee === '');

        if (isBedelsiz) {
            askConfirm("Bedelsiz kampanya giriyorsunuz, onaylıyor musunuz?", (res) => {
                if (res) {
                    window._dealDetails = { commission: comm, duration: duration, fee: 'Yok', joker: joker, campCount: campCount };
                    executeSaveAction(taskId);
                }
            });
        } else {
            window._dealDetails = { commission: comm, duration: duration, fee: fee, joker: joker, campCount: campCount };
            executeSaveAction(taskId);
        }
    }

    async function executeSaveAction(taskId) {
        const btn = document.getElementById('btnSaveModalLog');
        if (btn) { btn.disabled = true; btn.innerText = '⏳...'; }

        const task = AppState.tasks.find(t => t.id === taskId);
        if (!task) return;

        const logType = window._selectedModalLogType || '';
        const newStatus = window._selectedModalStatus || '';
        const fallbackFollowupNote = document.getElementById('followupReasonNote')?.value || '';
        const rawLogText = logType === 'Tekrar Aranacak' && fallbackFollowupNote
            ? fallbackFollowupNote
            : (document.getElementById('modalLogInput')?.value || '');
        const logText = esc(rawLogText);
        
        const nextCallDateVal = document.getElementById('flatpickrInput')?.value || '';
        const previousTask = JSON.parse(JSON.stringify(task));

        try {
            const payloadBuilder = window.TaskSavePayload?.buildTaskSavePayload || buildTaskSavePayloadFallback;
            const payloadResult = payloadBuilder({
                newStatus,
                logType,
                logText,
                nextCallDate: nextCallDateVal,
                dealDetails: window._dealDetails,
            });

            if (payloadResult.error) {
                if (btn) { btn.disabled = false; btn.innerText = "Kaydet 🚀"; }
                return showToast(payloadResult.error, 'error');
            }

            const { patchPayload } = payloadResult;
            patchPayload.expectedUpdatedAt = task.updatedAt || task.createdAt || new Date().toISOString();
            patchPayload.mutationKey = createTaskMutationKey(taskId);

            if (patchPayload.status || patchPayload.nextCallDate || patchPayload.activity) {
                const optimisticTask = {
                    ...task,
                    ...(patchPayload.status ? { status: patchPayload.status } : {}),
                    ...(patchPayload.nextCallDate !== undefined ? { nextCallDate: patchPayload.nextCallDate || '' } : {}),
                };

                if (patchPayload.activity) {
                    const nowLabel = new Date().toLocaleString('tr-TR');
                    optimisticTask.logs = [{
                        id: `optimistic-${taskId}-${Date.now()}`,
                        date: nowLabel,
                        user: AppState.loggedInUser?.name || 'Sistem',
                        text: patchPayload.activity.text || '',
                    }, ...(Array.isArray(task.logs) ? task.logs : [])];
                }

                _updateTaskInState(optimisticTask, { syncDetailCache: false });
            }

            if (Object.keys(patchPayload).length > 0) {
                await DataService.apiRequest(`/tasks/${taskId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(patchPayload)
                });
            }

            // İşletme kapanması durumu artık Backend tarafından 'ISLETME_KAPANMIS' logu geldiğinde otonom olarak yönetilecek.

            // Başarılı ise UI temizliği ve refresh
            window._dealDetails = null;
            showToast('İşlem başarıyla kaydedildi!', 'success');
            closeMiniModal();

            // Verileri tazele (Local State Update - Sadece ilgili görev çekilir ve UI güncellenir)
            try {
                const refreshedTask = await DataService.readPath('tasks/' + taskId, { force: true });
                _updateTaskInState(refreshedTask);
                const refreshedBiz = task.businessId ? await DataService.readPath('accounts/' + task.businessId, { force: true }).catch(() => null) : null;
                _updateBusinessInState(refreshedBiz);
            } catch (rErr) {
                console.warn('Görevi yeniden çekerken hata:', rErr);
            }
            
            if (btn) { btn.disabled = false; btn.innerText = "Kaydet 🚀"; }
            
            if (document.getElementById('inlineTaskContainer')) {
                if (window.renderTaskInline) window.renderTaskInline(taskId, 'inlineTaskContainer');
            } else {
                refreshTaskModalInPlace(taskId);
            }
        } catch (err) {
            if (typeof previousTask !== 'undefined' && previousTask?.id) {
                _updateTaskInState(previousTask);
            }
            const taskModal = document.getElementById('taskModal');
            if (taskModal?.style?.display === 'flex') {
                try {
                    if (typeof window.refreshTaskModalInPlace === 'function') {
                        window.refreshTaskModalInPlace(taskId);
                    } else {
                        refreshTaskModalInPlace(taskId);
                    }
                } catch (refreshErr) {
                    console.warn('Task modal revert refresh failed:', refreshErr);
                }
            }
            console.error('Kaydetme başarısız:', err);
            showToast(`Hata: ${err.message}`, 'error');
            if (btn) { btn.disabled = false; btn.innerText = "Kaydet 🚀"; }
        }
    }

    function deleteTask(taskId) {
        askConfirm('Bu görevi silmek istediğinize emin misiniz?', (res) => {
            if (!res) return;
            DataService.deleteTask(taskId).then(() => {
                const removedTask = _removeTaskFromState(taskId);
                addSystemLog(`Görev silindi: ${taskId}`);
                showToast('Görev silindi.', 'success');
                closeModal('taskModal');
                _refreshTaskViews(taskId);
                _refreshBusinessTaskHistory(removedTask?.businessId);
            }).catch((err) => {
                console.error('Task delete failed:', err);
                showToast(err?.message || 'Görev silinemedi.', 'error');
            });
        });
    }

    function _paginate(arr, page, perPage) {
        const start = (page - 1) * perPage;
        return arr.slice(start, start + perPage);
    }

    function createTaskMutationKey(taskId) {
        const randomPart = Math.random().toString(36).slice(2, 10);
        return `task-save-${taskId}-${Date.now()}-${randomPart}`;
    }

    function _updateTaskInState(refreshedTask, options = {}) {
        if (!refreshedTask?.id) return null;
        const syncDetailCache = options?.syncDetailCache !== false;
        const taskIndex = AppState.tasks.findIndex((task) => task.id === refreshedTask.id);
        if (taskIndex < 0) {
            AppState.tasks = [...AppState.tasks, refreshedTask];
        } else {
            const nextTasks = [...AppState.tasks];
            nextTasks[taskIndex] = refreshedTask;
            AppState.tasks = nextTasks;
        }
        if (syncDetailCache && typeof AppState.setTaskDetail === 'function') {
            AppState.setTaskDetail(refreshedTask.id, refreshedTask);
        }
        if (taskSurfaceRefreshTimer) {
            clearTimeout(taskSurfaceRefreshTimer);
        }
        taskSurfaceRefreshTimer = setTimeout(() => {
            taskSurfaceRefreshTimer = null;
            if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
            if (document.getElementById('myActiveTaskList')) {
                renderMyTasks();
            }
            if (document.getElementById('allActiveTaskList')) {
                renderAllTasks();
            }
            if (typeof DashboardController !== 'undefined' && typeof DashboardController.render === 'function') {
                DashboardController.render(true);
            }
        }, 0);
        return refreshedTask;
    }

    function cancelPendingSurfaceRefresh() {
        if (!taskSurfaceRefreshTimer) return;
        clearTimeout(taskSurfaceRefreshTimer);
        taskSurfaceRefreshTimer = null;
    }

    function _removeTaskFromState(taskId, fallbackTask = null) {
        if (!taskId) return null;
        const removedTask = (AppState.tasks || []).find((task) => task.id === taskId) || fallbackTask || null;
        AppState.tasks = (AppState.tasks || []).filter((task) => task.id !== taskId);
        if (typeof AppState.clearTaskDetail === 'function') {
            AppState.clearTaskDetail(taskId);
        }
        return removedTask;
    }

    async function _refreshBusinessTaskHistory(businessId) {
        if (!businessId || !document.getElementById('bizTaskHistoryBody')) return;
        try {
            if (typeof BusinessController !== 'undefined' && typeof BusinessController._fetchBusinessTaskHistory === 'function' && typeof BusinessController._mapBusinessTaskRows === 'function') {
                const response = await BusinessController._fetchBusinessTaskHistory(businessId);
                window._currentBizTasks = BusinessController._mapBusinessTaskRows(response);
            } else {
                const response = await DataService.apiRequest(`/accounts/${encodeURIComponent(businessId)}/task-history`);
                window._currentBizTasks = Array.isArray(response) ? response.map((row) => ({
                    id: row.id,
                    createdAt: row.creationDate || '',
                    creationDate: row.creationDate || '',
                    assignee: row.historicalAssignee || row.owner?.name || row.owner?.email || 'Havuz',
                    historicalAssignee: row.historicalAssignee || '',
                    owner: row.owner || null,
                    mainCategory: row.mainCategory || '-',
                    subCategory: row.subCategory || '-',
                    sourceType: row.source || '-',
                    sourceKey: row.source || '-',
                    status: row.status || '',
                    statusKey: String(row.status || '').toLowerCase(),
                    statusLabel: row.status || '',
                    generalStatus: row.generalStatus || '',
                    closedAt: row.closedAt || null,
                    closedReason: row.closedReason || null,
                })) : [];
            }
        } catch (error) {
            console.warn('Business task history refresh failed:', error);
            window._currentBizTasks = [];
        }
        if (typeof window.renderBizTaskHistoryPage === 'function') {
            window.renderBizTaskHistoryPage(1);
        }
    }

    function _updateBusinessInState(refreshedBiz) {
        if (!refreshedBiz?.id) return null;
        const bizIndex = AppState.businesses.findIndex((biz) => biz.id === refreshedBiz.id);
        if (bizIndex < 0) {
            AppState.businesses = [...AppState.businesses, refreshedBiz];
        } else {
            const nextBusinesses = [...AppState.businesses];
            nextBusinesses[bizIndex] = refreshedBiz;
            AppState.businesses = nextBusinesses;
        }
        if (typeof AppState.setBusinessDetail === 'function') {
            AppState.setBusinessDetail(refreshedBiz.id, refreshedBiz);
        }
        return refreshedBiz;
    }

    function _refreshTaskViews(taskId) {
        const activePage = document.querySelector('.page-content.active')?.id || '';
        if (document.getElementById('myActiveTaskList')) {
            renderMyTasks();
        }
        if (document.getElementById('allActiveTaskList')) {
            renderAllTasks();
        }
        if (activePage === 'page-businesses' && typeof BusinessController !== 'undefined' && AppState.isBizSearched) {
            BusinessController.search(false);
        } else if (activePage === 'page-passive-tasks' && typeof ArchiveController !== 'undefined') {
            ArchiveController.renderPassiveTasks(false);
        } else if (activePage === 'page-reports' && typeof ReportController !== 'undefined') {
            ReportController.renderReports();
        }

        if (typeof DashboardController !== 'undefined' && typeof DashboardController.render === 'function') {
            DashboardController.render(true);
        }

        if (document.getElementById('inlineTaskContainer')) {
            if (window.renderTaskInline) window.renderTaskInline(taskId, 'inlineTaskContainer');
            return;
        }

        const taskModal = document.getElementById('taskModal');
        if (taskModal?.style.display === 'flex') {
            refreshTaskModalInPlace(taskId);
        }
    }

    function refreshTaskModalInPlace(taskId) {
        const tm = document.getElementById('taskModal');
        const ma = document.getElementById('modalContentArea');
        if (!tm || !ma || tm.style.display !== 'flex') return;

        const activeBtn = tm.querySelector('.tm-tab-btn.active');
        let activeTab = 'user';
        if (activeBtn?.id === 'tabBtnOffers') activeTab = 'offers';
        else if ((activeBtn?.textContent || '').includes('Sistem')) activeTab = 'system';

        const taskDetail = typeof AppState.getTaskDetail === 'function' ? AppState.getTaskDetail(taskId) : null;
        const task = taskDetail || AppState.tasks.find(t => t.id === taskId);
        if (!task) return;
        const biz = AppState.getBizMap().get(task.businessId) || task;
        task.logs = task.logs || [];
        task.offers = task.offers || [];

        const allInteractionLogs = [];
        const allSystemLogs = [...(task.systemLogs || [])];

        (task.logs || []).forEach(log => {
            const text = (log.text || '').trim();
            if (text.includes('[Deal Sonucu]')) {
                return;
            }
            let isSystem = false;

            if (text.includes('[Sistem]') || text.includes('[Devir]') || text.includes('[Klonlanmış Kampanya]')) {
                isSystem = true;
            } else if (/^\[(.*?)\]/.test(text.replace(/<[^>]*>?/gm, '').trim())) {
                const plainTextForTag = text.replace(/<[^>]*>?/gm, '').trim();
                const tagMatch = plainTextForTag.match(/^\[(.*?)\]/);
                const tag = tagMatch ? tagMatch[1] : '';
                const cleanText = plainTextForTag.replace(/^\[(.*?)\]/, '').trim();
                if (tag === 'Görev Notu' || tag === 'Geçmiş Kayıt') isSystem = false;
                else isSystem = (!cleanText || (cleanText.startsWith('(') && cleanText.endsWith(')')));
            }

            if (isSystem) allSystemLogs.push(log);
            else allInteractionLogs.push(log);
        });

        allSystemLogs.sort((a, b) => {
            const dateStrA = a.date.replace(/[^0-9]/g, '');
            const dateStrB = b.date.replace(/[^0-9]/g, '');
            return dateStrB.localeCompare(dateStrA);
        });

        const logsHTML = _buildTabbedLogsHTML(allInteractionLogs, allSystemLogs, task);
        const topBarHTML = _buildTaskModalTopBar(task, biz);

        ma.innerHTML = `
            ${topBarHTML}
            ${logsHTML}
            ${_buildActionBarHTML(task)}`;

        if (typeof window.initFlatpickr === 'function') window.initFlatpickr();

        if (activeTab === 'system') {
            const systemBtn = Array.from(tm.querySelectorAll('.tm-tab-btn')).find(btn => (btn.textContent || '').includes('Sistem'));
            switchLogTab('system', systemBtn);
        } else if (activeTab === 'offers') {
            switchLogTab('offers', document.getElementById('tabBtnOffers'));
        } else {
            const userBtn = tm.querySelector('.tm-tab-btn');
            switchLogTab('user', userBtn);
        }
    }

    return {
        createCard,
        createMinimalCard,
        renderMyTasks,
        renderAllTasks,
        prepareTaskReportView,
        renderTaskReports,
        resetTaskReportView,
        clearTaskReportFilters,
        exportTaskReportExcel,
        updateTaskReportSubCategories,
        switchTaskListSubtab,
        openTeamPulseModal,
        setTeamPulseModalPeriod,
        setTeamPulseModalMetric,
        setTeamPulseModalPage,
        setTeamPulseContactedPeriod,
        setTeamPulseRecords,
        openTaskModal,
        renderTaskInline,
        _buildTabbedLogsHTML,
        _buildTimelineHTML,
        _buildOffersHTML,
        _buildActionBarHTML, /* DÜZELTİLDİ: Fonksiyon artık dahil! */
        stripEditableLogPrefixForPrompt,
        triggerSaveAction,
        closeMiniModal,
        executeDealSaveAction,
        executeSaveAction,
        refreshTaskModalInPlace,
        deleteTask,
        updateTaskInState: _updateTaskInState,
        refreshTaskViews: _refreshTaskViews,
        cancelPendingSurfaceRefresh,
        selectModalStatus,
        toggleCustomLogTypeMenu,
        selectModalLogType,
        switchLogTab,
        openContactUpdateModal,
        executeContactUpdate,
        openTaskTransferModal,
        executeTaskTransfer,
        refreshTaskTransferSummary,
        markActiveQuickFollowup,
        pickQuickFollowup,
        refreshFollowupSummary,
        syncTaskComposerValue,
        openTaskNoteComposer,
        closeTaskNoteComposer,
        resetAllTasksFilters,
    };
})();

// Global erişim
window.renderMyTasks = TaskController.renderMyTasks.bind(TaskController);
window.switchLogTab = TaskController.switchLogTab.bind(TaskController);
window.renderAllTasks = TaskController.renderAllTasks.bind(TaskController);
window.renderTaskReports = TaskController.renderTaskReports.bind(TaskController);
window.resetTaskReportView = TaskController.resetTaskReportView.bind(TaskController);
window.clearTaskReportFilters = TaskController.clearTaskReportFilters.bind(TaskController);
window.exportTaskReportExcel = TaskController.exportTaskReportExcel.bind(TaskController);
window.switchTaskListSubtab = TaskController.switchTaskListSubtab.bind(TaskController);
window.updateTaskReportSubCategories = TaskController.updateTaskReportSubCategories.bind(TaskController);
window.openTeamPulseModal = TaskController.openTeamPulseModal.bind(TaskController);
window.setTeamPulseModalPeriod = TaskController.setTeamPulseModalPeriod.bind(TaskController);
window.setTeamPulseModalMetric = TaskController.setTeamPulseModalMetric.bind(TaskController);
window.setTeamPulseModalPage = TaskController.setTeamPulseModalPage.bind(TaskController);
window.setTeamPulseContactedPeriod = TaskController.setTeamPulseContactedPeriod.bind(TaskController);
window.setTeamPulseRecords = TaskController.setTeamPulseRecords.bind(TaskController);
window.openTaskModal = TaskController.openTaskModal.bind(TaskController);
window.markActiveQuickFollowup = TaskController.markActiveQuickFollowup.bind(TaskController);
window.pickQuickFollowup = TaskController.pickQuickFollowup.bind(TaskController);
window.refreshFollowupSummary = TaskController.refreshFollowupSummary.bind(TaskController);
window.resetAllTasksFilters = TaskController.resetAllTasksFilters.bind(TaskController);
window.renderTaskInline = TaskController.renderTaskInline.bind(TaskController);
window.triggerSaveAction = TaskController.triggerSaveAction.bind(TaskController);
window.closeMiniModal = TaskController.closeMiniModal.bind(TaskController);
window.executeSaveAction = TaskController.executeSaveAction.bind(TaskController);
window.refreshTaskModalInPlace = TaskController.refreshTaskModalInPlace.bind(TaskController);
window.executeDealSaveAction = TaskController.executeDealSaveAction?.bind(TaskController) || (typeof executeDealSaveAction !== 'undefined' ? executeDealSaveAction : null);
window.createCard = TaskController.createCard.bind(TaskController);
window.deleteTask = TaskController.deleteTask.bind(TaskController);
window.selectModalStatus = TaskController.selectModalStatus.bind(TaskController);
window.toggleCustomLogTypeMenu = TaskController.toggleCustomLogTypeMenu.bind(TaskController);
window.selectModalLogType = TaskController.selectModalLogType.bind(TaskController);
window.openContactUpdateModal = TaskController.openContactUpdateModal.bind(TaskController);
window.executeContactUpdate = TaskController.executeContactUpdate.bind(TaskController);
window.openTaskTransferModal = TaskController.openTaskTransferModal.bind(TaskController);
window.executeTaskTransfer = TaskController.executeTaskTransfer.bind(TaskController);
window.refreshTaskTransferSummary = TaskController.refreshTaskTransferSummary.bind(TaskController);
window.syncTaskComposerValue = TaskController.syncTaskComposerValue.bind(TaskController);
window.openTaskNoteComposer = TaskController.openTaskNoteComposer.bind(TaskController);
window.closeTaskNoteComposer = TaskController.closeTaskNoteComposer.bind(TaskController);

function addSystemLog(action) {
    if (!AppState.loggedInUser) return Promise.resolve();
    return DataService.addSystemLog(action, AppState.loggedInUser.name);
}

window.deleteTaskLog = async function(taskId, logId) {
    if (!logId || logId.length > 36) {
        // Eski logDate ise silmeyi denemeyelim, veya backend destekliyorsa logDate'e göre API yazılabilir.
        // Biz yeni logId bekliyoruz.
    }
    
    askConfirm("Bu log kaydını kalıcı olarak silmek istediğinize emin misiniz?", async (res) => {
        if (!res) return;
        
        try {
            await DataService.apiRequest(`/tasks/${taskId}/activity/${logId}`, {
                method: 'DELETE'
            });
            
            showToast("Log başarıyla silindi.", "success");

            try {
                const refreshedTask = await DataService.readPath(`tasks/${taskId}`, { force: true });
                TaskController.updateTaskInState(refreshedTask);
            } catch (refreshErr) {
                console.warn('Log silindikten sonra gorev detayi yenilenemedi, mevcut durum korunuyor.', refreshErr);
            }
            TaskController.refreshTaskViews(taskId);
        } catch (err) {
            console.error("Log silme hatası:", err);
            showToast(`Log silinirken hata oluştu: ${err.message}`, "error");
        }
    });
};

window.editTaskLog = function(taskId, logId, encodedText) {
    const currentText = decodeURIComponent(String(encodedText || ''));
    const editableText = TaskController.stripEditableLogPrefixForPrompt(currentText);
    askPrompt("Log metnini güncelleyin", String(editableText || '').trim(), async (value) => {
        if (value === null) return;
        const nextText = String(value || '').trim();
        if (!nextText) {
            showToast("Log metni boş bırakılamaz.", "warning");
            return;
        }

        try {
            await DataService.apiRequest(`/tasks/${taskId}/activity/${logId}`, {
                method: 'PATCH',
                body: JSON.stringify({ text: nextText }),
            });

            showToast("Log başarıyla güncellendi.", "success");
            const refreshedTask = await DataService.readPath(`tasks/${taskId}`, { force: true });
            TaskController.updateTaskInState(refreshedTask);
            TaskController.refreshTaskViews(taskId);
        } catch (err) {
            console.error("Log güncelleme hatası:", err);
            showToast(`Log güncellenirken hata oluştu: ${err.message}`, "error");
        }
    });
};
