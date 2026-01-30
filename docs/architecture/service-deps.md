# 服务依赖关系快照

- 统计时间：2026-01-28T18:13:41.088Z
- Service 总数：37

## Top 出边（依赖最多）

| Service | 依赖数 | 依赖列表 |
| --- | --- | --- |
| LegacyTaskService | 11 | DbService, BrainService, PainterService, ModelConfigResolverService, TaskCommonService, HeroStoryboardService, TaskBillingService, PrismaService, CosService, TaskRenderingOrchestratorService, TaskCrudService |
| DirectTaskService | 8 | DbService, PainterService, ModelConfigResolverService, TaskBillingService, CosService, DirectPromptService, TaskCommonService, PresetMetaService |
| HeroStoryboardService | 7 | DbService, BrainService, PainterService, CosService, ModelConfigResolverService, WorkflowPromptService, TaskBillingService |
| FixService | 4 | DbService, BrainService, PainterService, ModelConfigResolverService |
| TaskRenderingOrchestratorService | 4 | DbService, PainterService, TaskBillingService, CosService |
| CreditService | 3 | DbService, UserDbService, PrismaService |
| PromptOptimizerService | 3 | BrainService, PromptOptimizerPromptService, BrainRoutingService |
| TaskService | 3 | TaskCrudService, DirectTaskService, LegacyTaskService |
| BrainService | 2 | TranslationService, CosService |
| FacePresetMigrationService | 2 | DbService, CosService |

## Top 入边（被依赖最多）

| Service | 被依赖数 |
| --- | --- |
| DbService | 12 |
| PrismaService | 11 |
| CosService | 8 |
| PainterService | 5 |
| ModelConfigResolverService | 5 |
| BrainService | 4 |
| TaskBillingService | 4 |
| ModelProfileService | 2 |
| TaskCommonService | 2 |
| TaskCrudService | 2 |

## 全量依赖清单

- AdminAnalyticsService: PrismaService
- AdminLogService: -
- AppService: -
- AuthService: -
- BrainPromptService: -
- BrainRoutingService: ModelProfileService
- BrainService: TranslationService, CosService
- CosService: -
- CreditService: DbService, UserDbService, PrismaService
- DbService: PrismaService
- DirectPromptService: -
- DirectTaskService: DbService, PainterService, ModelConfigResolverService, TaskBillingService, CosService, DirectPromptService, TaskCommonService, PresetMetaService
- FacePresetMigrationService: DbService, CosService
- FixService: DbService, BrainService, PainterService, ModelConfigResolverService
- HeroStoryboardService: DbService, BrainService, PainterService, CosService, ModelConfigResolverService, WorkflowPromptService, TaskBillingService
- LearnPromptService: -
- LegacyTaskService: DbService, BrainService, PainterService, ModelConfigResolverService, TaskCommonService, HeroStoryboardService, TaskBillingService, PrismaService, CosService, TaskRenderingOrchestratorService, TaskCrudService
- ModelConfigResolverService: ModelProfileService
- ModelProfileService: -
- PainterService: CosService
- PresetCollectionService: PrismaService, DbService
- PresetMetaService: PrismaService, DbService
- PrismaService: -
- PromptOptimizerPromptService: -
- PromptOptimizerService: BrainService, PromptOptimizerPromptService, BrainRoutingService
- PromptSnippetService: PrismaService
- StylePresetMigrationService: DbService, CosService
- TaskAccessService: DbService
- TaskBillingService: PrismaService
- TaskCommonService: ModelConfigResolverService
- TaskCrudService: DbService, PrismaService
- TaskRenderingOrchestratorService: DbService, PainterService, TaskBillingService, CosService
- TaskService: TaskCrudService, DirectTaskService, LegacyTaskService
- TranslationService: -
- UserAssetService: PrismaService
- UserDbService: PrismaService
- WorkflowPromptService: -
