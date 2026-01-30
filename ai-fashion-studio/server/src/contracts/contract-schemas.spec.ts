import {
  TestConnectionBodySchema,
  BrainPromptCreateVersionBodySchema,
  BrainPromptPublishBodySchema,
  BrainPromptAbCompareBodySchema,
  CosCredentialsBodySchema,
  CosImageUrlBodySchema,
  CosOptimizedUrlBodySchema,
  McpMessageBodySchema,
  UpdateQcStatusBodySchema,
  FixShotBodySchema,
  WorkflowPromptPackSchema,
  CreateWorkflowPromptBodySchema,
  PublishWorkflowPromptBodySchema,
  GetTasksQuerySchema,
  EditShotBodySchema,
  CreateDirectTaskBodySchema,
  CreateDirectUrlsTaskBodySchema,
  DirectRegenerateBodySchema,
  DirectMessageBodySchema,
  ApproveTaskBodySchema,
  ClaimTaskBodySchema,
  ToggleFavoriteBodySchema,
  AdminAnalyticsOverviewQuerySchema,
  AdminLogsRecentQuerySchema,
  AdminCreateInviteBodySchema,
  AdminUsersSummaryQuerySchema,
  AdminUpdateMeBodySchema,
  AdminCreateUserBodySchema,
  AdminUpdateUserBodySchema,
  AdminPromptOptimizerCreateVersionBodySchema,
  AdminPromptOptimizerPublishBodySchema,
  AdminBrainRoutingBodySchema,
  AdminCreateModelProfileBodySchema,
  AdminUpdateModelProfileBodySchema,
  AdminSetActiveModelProfileBodySchema,
  AdminCreateDirectPromptBodySchema,
  AdminPublishDirectPromptBodySchema,
  AdminCreateLearnPromptBodySchema,
  AdminPublishLearnPromptBodySchema,
  PromptOptimizerBodySchema,
  UserAssetCreateBodySchema,
  UserAssetListQuerySchema,
  PosePresetUpdateBodySchema,
  PosePresetRelearnBodySchema,
  StylePresetUpdateBodySchema,
  StylePresetRelearnBodySchema,
  RegisterBodySchema,
  LoginBodySchema,
  CreateFacePresetBodySchema,
  UpdateFacePresetBodySchema,
  PresetMetaBatchBodySchema,
  AdminOverviewQuerySchema,
  AdminRechargeBodySchema,
  UpdateStoryboardShotBodySchema,
  UpdateShootLogBodySchema,
  EditHeroBodySchema,
  SelectHeroVariantBodySchema,
  AuthRegisterResponseSchema,
  AuthLoginResponseSchema,
  AuthMeResponseSchema,
  AuthLogoutResponseSchema,
  AdminCreateInviteResponseSchema,
  AdminListInvitesResponseSchema,
  AdminRevokeInviteResponseSchema,
  AdminUpdateMeResponseSchema,
  AdminCreateUserResponseSchema,
  AdminUsersResponseSchema,
  AdminUsersSummaryResponseSchema,
  AdminUpdateUserResponseSchema,
  AdminDeleteUserResponseSchema,
  UserCreditsResponseSchema,
  CreditTransactionsResponseSchema,
  CreditCheckResponseSchema,
  AdminRechargeResponseSchema,
  CreditAdminOverviewResponseSchema,
  FacePresetSchema,
  StylePresetSchema,
  FacePresetDeleteResponseSchema,
  PresetMetaBatchResponseSchema,
  TaskModelSchema,
  TaskCreateResponseSchema,
  TaskListResponseSchema,
  TaskDeleteResponseSchema,
  TaskRetryResponseSchema,
  TaskApproveResponseSchema,
  TaskUpdateShotPromptResponseSchema,
  EditShotResponseSchema,
  FixUpdateQcStatusResponseSchema,
  FixShotResponseSchema,
  HeroStoryboardTaskResponseSchema,
  BrainPromptActiveResponseSchema,
  BrainPromptListResponseSchema,
  BrainPromptGetVersionResponseSchema,
  BrainPromptCreateVersionResponseSchema,
  BrainPromptPublishResponseSchema,
  BrainPromptAbCompareResponseSchema,
  WorkflowPromptActiveResponseSchema,
  WorkflowPromptListResponseSchema,
  WorkflowPromptGetVersionResponseSchema,
  WorkflowPromptCreateVersionResponseSchema,
  WorkflowPromptPublishResponseSchema,
  DirectPromptActiveResponseSchema,
  DirectPromptListResponseSchema,
  DirectPromptGetVersionResponseSchema,
  DirectPromptCreateVersionResponseSchema,
  DirectPromptPublishResponseSchema,
  LearnPromptActiveResponseSchema,
  LearnPromptListResponseSchema,
  LearnPromptGetVersionResponseSchema,
  LearnPromptCreateVersionResponseSchema,
  LearnPromptPublishResponseSchema,
  PromptOptimizerResponseSchema,
  PromptSnippetListResponseSchema,
  PromptSnippetCreateResponseSchema,
  PromptSnippetDeleteResponseSchema,
  PromptOptimizerPromptActiveResponseSchema,
  PromptOptimizerPromptListResponseSchema,
  PromptOptimizerPromptGetVersionResponseSchema,
  PromptOptimizerPromptCreateVersionResponseSchema,
  PromptOptimizerPromptPublishResponseSchema,
} from './api.schemas';

describe('Contract schemas', () => {
  it('TestConnectionBodySchema validates required fields', () => {
    expect(
      TestConnectionBodySchema.safeParse({
        gateway: 'https://api.example.com',
        apiKey: 'key',
      }).success,
    ).toBe(true);
    expect(
      TestConnectionBodySchema.safeParse({ apiKey: 'key' }).success,
    ).toBe(false);
  });

  it('BrainPrompt schemas validate required fields', () => {
    expect(
      BrainPromptCreateVersionBodySchema.safeParse({
        content: 'system prompt',
        publish: true,
      }).success,
    ).toBe(true);
    expect(
      BrainPromptCreateVersionBodySchema.safeParse({ content: '' }).success,
    ).toBe(false);
    expect(
      BrainPromptPublishBodySchema.safeParse({ versionId: 'v1' }).success,
    ).toBe(true);
    expect(
      BrainPromptAbCompareBodySchema.safeParse({
        taskId: 'task-1',
        versionA: 'vA',
        versionB: 'vB',
      }).success,
    ).toBe(true);
  });

  it('Cos schemas validate required fields', () => {
    expect(CosCredentialsBodySchema.safeParse({}).success).toBe(true);
    expect(
      CosImageUrlBodySchema.safeParse({
        key: 'path/to/image.png',
        format: 'webp',
        quality: 80,
      }).success,
    ).toBe(true);
    expect(CosImageUrlBodySchema.safeParse({}).success).toBe(false);
    expect(
      CosOptimizedUrlBodySchema.safeParse({ key: 'path' }).success,
    ).toBe(true);
  });

  it('Mcp schema allows unknown payloads', () => {
    expect(McpMessageBodySchema.safeParse({ hello: 'world' }).success).toBe(
      true,
    );
    expect(McpMessageBodySchema.safeParse(null).success).toBe(true);
  });

  it('Fix schemas validate enums and required fields', () => {
    expect(
      UpdateQcStatusBodySchema.safeParse({ qcStatus: 'APPROVED' }).success,
    ).toBe(true);
    expect(
      UpdateQcStatusBodySchema.safeParse({ qcStatus: 'INVALID' }).success,
    ).toBe(false);
    expect(FixShotBodySchema.safeParse({ feedback: 'adjust details' }).success).toBe(
      true,
    );
    expect(FixShotBodySchema.safeParse({ feedback: '' }).success).toBe(false);
  });

  it('Workflow prompt schemas validate pack', () => {
    expect(
      WorkflowPromptPackSchema.safeParse({
        plannerSystemPrompt: 'planner',
        painterSystemPrompt: 'painter',
      }).success,
    ).toBe(true);
    expect(
      CreateWorkflowPromptBodySchema.safeParse({
        pack: {
          plannerSystemPrompt: 'planner',
          painterSystemPrompt: 'painter',
        },
      }).success,
    ).toBe(true);
    expect(
      PublishWorkflowPromptBodySchema.safeParse({ versionId: 'v1' }).success,
    ).toBe(true);
  });

  it('Task query schema handles filters', () => {
    expect(
      GetTasksQuerySchema.safeParse({ page: '1', limit: '10' }).success,
    ).toBe(true);
    expect(
      GetTasksQuerySchema.safeParse({ status: 'COMPLETED' }).success,
    ).toBe(true);
  });

  it('Direct task schemas validate required fields', () => {
    expect(
      CreateDirectTaskBodySchema.safeParse({ prompt: 'test' }).success,
    ).toBe(true);
    expect(
      CreateDirectUrlsTaskBodySchema.safeParse({
        prompt: 'test',
        garmentUrls: ['http://example.com/a.png'],
      }).success,
    ).toBe(true);
  });

  it('Task action schemas validate required fields', () => {
    expect(
      EditShotBodySchema.safeParse({
        maskImage: 'mask',
        prompt: 'adjust',
      }).success,
    ).toBe(true);
    expect(
      DirectRegenerateBodySchema.safeParse({}).success,
    ).toBe(true);
    expect(
      DirectMessageBodySchema.safeParse({ message: 'hi' }).success,
    ).toBe(true);
    expect(
      ApproveTaskBodySchema.safeParse({}).success,
    ).toBe(true);
    expect(
      ClaimTaskBodySchema.safeParse({ claimToken: 'token' }).success,
    ).toBe(true);
    expect(
      ToggleFavoriteBodySchema.safeParse({ favorite: true }).success,
    ).toBe(true);
  });

  it('Admin schemas validate queries and bodies', () => {
    expect(
      AdminAnalyticsOverviewQuerySchema.safeParse({ days: '7' }).success,
    ).toBe(true);
    expect(
      AdminLogsRecentQuerySchema.safeParse({ limit: '100' }).success,
    ).toBe(true);
    expect(
      AdminCreateInviteBodySchema.safeParse({ note: 'test' }).success,
    ).toBe(true);
    expect(
      AdminUsersSummaryQuerySchema.safeParse({ page: '1', limit: '20' })
        .success,
    ).toBe(true);
    expect(
      AdminUpdateMeBodySchema.safeParse({ currentPassword: 'x' }).success,
    ).toBe(true);
    expect(
      AdminCreateUserBodySchema.safeParse({
        username: 'user1',
        password: 'secret123',
      }).success,
    ).toBe(true);
    expect(
      AdminUpdateUserBodySchema.safeParse({ credits: 10 }).success,
    ).toBe(true);
    expect(
      AdminPromptOptimizerCreateVersionBodySchema.safeParse({ content: 'test' })
        .success,
    ).toBe(true);
    expect(
      AdminPromptOptimizerPublishBodySchema.safeParse({ versionId: 'v1' })
        .success,
    ).toBe(true);
    expect(
      AdminBrainRoutingBodySchema.safeParse({ defaultBrainProfileId: null })
        .success,
    ).toBe(true);
    expect(
      AdminCreateModelProfileBodySchema.safeParse({
        kind: 'BRAIN',
        name: 'profile',
        gateway: 'http://example.com',
        model: 'model',
        apiKey: 'key',
      }).success,
    ).toBe(true);
    expect(
      AdminUpdateModelProfileBodySchema.safeParse({ disabled: true }).success,
    ).toBe(true);
    expect(
      AdminSetActiveModelProfileBodySchema.safeParse({
        brainProfileIds: ['a'],
      }).success,
    ).toBe(true);
    expect(
      AdminCreateDirectPromptBodySchema.safeParse({
        pack: { directSystemPrompt: 'prompt' },
      }).success,
    ).toBe(true);
    expect(
      AdminPublishDirectPromptBodySchema.safeParse({ versionId: 'v1' }).success,
    ).toBe(true);
    expect(
      AdminCreateLearnPromptBodySchema.safeParse({
        pack: { styleLearnPrompt: 's', poseLearnPrompt: 'p' },
      }).success,
    ).toBe(true);
    expect(
      AdminPublishLearnPromptBodySchema.safeParse({ versionId: 'v1' }).success,
    ).toBe(true);
  });

  it('Prompt optimizer schema validates required fields', () => {
    expect(
      PromptOptimizerBodySchema.safeParse({
        prompt: 'optimize',
        settings: {
          layoutMode: 'Individual',
          shotCount: 2,
          resolution: '2K',
          aspectRatio: '9:16',
        },
      }).success,
    ).toBe(true);
  });

  it('User asset schemas validate payloads', () => {
    expect(
      UserAssetListQuerySchema.safeParse({ page: '1', limit: '10' }).success,
    ).toBe(true);
    expect(
      UserAssetCreateBodySchema.safeParse({
        items: [
          {
            url: 'http://example.com/a.png',
            sha256:
              '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('Pose preset schemas validate payloads', () => {
    expect(
      PosePresetUpdateBodySchema.safeParse({ name: 'pose' }).success,
    ).toBe(true);
    expect(PosePresetRelearnBodySchema.safeParse({}).success).toBe(true);
  });

  it('Style preset schemas validate payloads', () => {
    expect(
      StylePresetUpdateBodySchema.safeParse({ name: 'style' }).success,
    ).toBe(true);
    expect(StylePresetRelearnBodySchema.safeParse({}).success).toBe(true);
  });

  it('Auth schemas validate required fields', () => {
    expect(
      RegisterBodySchema.safeParse({
        username: 'user',
        password: 'secret123',
      }).success,
    ).toBe(true);
    expect(
      RegisterBodySchema.safeParse({ username: 'user' }).success,
    ).toBe(false);
    expect(
      LoginBodySchema.safeParse({ username: 'user', password: 'pwd' }).success,
    ).toBe(true);
    expect(LoginBodySchema.safeParse({ username: 'user' }).success).toBe(false);
  });

  it('Face preset schemas validate payloads', () => {
    expect(
      CreateFacePresetBodySchema.safeParse({ name: 'preset' }).success,
    ).toBe(true);
    expect(
      UpdateFacePresetBodySchema.safeParse({ weight: 60 }).success,
    ).toBe(true);
  });

  it('Preset meta schemas validate payloads', () => {
    expect(
      PresetMetaBatchBodySchema.safeParse({
        kind: 'STYLE',
        ids: ['a'],
        action: 'add-tags',
        payload: { tags: ['tag1'] },
      }).success,
    ).toBe(true);
    expect(
      PresetMetaBatchBodySchema.safeParse({
        kind: 'STYLE',
        ids: ['a'],
        action: 'add-tags',
      }).success,
    ).toBe(false);
  });

  it('Credit schemas validate payloads', () => {
    expect(AdminOverviewQuerySchema.safeParse({ topN: '10' }).success).toBe(
      true,
    );
    expect(
      AdminRechargeBodySchema.safeParse({ userId: 'not-a-uuid', amount: 10 })
        .success,
    ).toBe(false);
  });

  it('Hero storyboard schemas validate payloads', () => {
    expect(
      UpdateShootLogBodySchema.safeParse({ shootLogText: 'note' }).success,
    ).toBe(true);
    expect(
      EditHeroBodySchema.safeParse({
        maskImage: 'http://example.com/a.png',
        prompt: 'edit',
      }).success,
    ).toBe(true);
    expect(
      SelectHeroVariantBodySchema.safeParse({ attemptCreatedAt: '123' }).success,
    ).toBe(true);
    expect(
      UpdateStoryboardShotBodySchema.safeParse({ patch: {} }).success,
    ).toBe(false);
  });

  it('Response schemas validate shapes', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const inviteId = '22222222-2222-4222-8222-222222222222';
    const transactionId = '33333333-3333-4333-8333-333333333333';
    const facePresetId = '44444444-4444-4444-8444-444444444444';
    const stylePresetId = '55555555-5555-4555-8555-555555555555';
    const user = {
      id: userId,
      username: 'u1',
      status: 'ACTIVE',
      role: 'USER',
      credits: 10,
      totalTasks: 2,
      createdAt: Date.now(),
    };
    const invite = {
      id: inviteId,
      createdAt: Date.now(),
    };
    const transaction = {
      id: transactionId,
      userId,
      type: 'EARN',
      amount: 10,
      balance: 10,
      reason: 'test',
      createdAt: Date.now(),
    };
    const facePreset = {
      id: facePresetId,
      name: 'face',
      imagePath: '/path',
      createdAt: Date.now(),
    };
    const stylePreset = {
      id: stylePresetId,
      name: 'style',
      imagePaths: ['/path/a.png'],
      createdAt: Date.now(),
    };

    expect(
      AuthRegisterResponseSchema.safeParse({
        success: true,
        message: 'ok',
        user,
      }).success,
    ).toBe(true);
    expect(
      AuthLoginResponseSchema.safeParse({
        success: true,
        token: 'token',
        user,
      }).success,
    ).toBe(true);
    expect(
      AuthMeResponseSchema.safeParse({ success: true, user }).success,
    ).toBe(true);
    expect(
      AuthLogoutResponseSchema.safeParse({ success: true, message: 'ok' })
        .success,
    ).toBe(true);
    expect(
      AdminCreateInviteResponseSchema.safeParse({
        success: true,
        code: 'code',
        invite,
      }).success,
    ).toBe(true);
    expect(
      AdminListInvitesResponseSchema.safeParse({
        success: true,
        invites: [invite],
      }).success,
    ).toBe(true);
    expect(
      AdminRevokeInviteResponseSchema.safeParse({
        success: true,
        invite,
      }).success,
    ).toBe(true);
    expect(
      AdminUpdateMeResponseSchema.safeParse({
        success: true,
        token: 'token',
        user,
      }).success,
    ).toBe(true);
    expect(
      AdminCreateUserResponseSchema.safeParse({ success: true, user }).success,
    ).toBe(true);
    expect(
      AdminUsersResponseSchema.safeParse({
        success: true,
        users: [user],
      }).success,
    ).toBe(true);
    expect(
      AdminUsersSummaryResponseSchema.safeParse({
        success: true,
        users: [{ ...user, totalEarned: 10, totalSpent: 5 }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }).success,
    ).toBe(true);
    expect(
      AdminUpdateUserResponseSchema.safeParse({ success: true, user }).success,
    ).toBe(true);
    expect(
      AdminDeleteUserResponseSchema.safeParse({ success: true }).success,
    ).toBe(true);
    expect(
      UserCreditsResponseSchema.safeParse({
        userId: user.id,
        balance: 10,
        totalEarned: 20,
        totalSpent: 10,
      }).success,
    ).toBe(true);
    expect(
      CreditTransactionsResponseSchema.safeParse({
        transactions: [transaction],
        total: 1,
        page: 1,
      }).success,
    ).toBe(true);
    expect(
      CreditCheckResponseSchema.safeParse({
        enough: true,
        required: 2,
        balance: 10,
      }).success,
    ).toBe(true);
    expect(
      AdminRechargeResponseSchema.safeParse({
        success: true,
        message: 'ok',
        userId: user.id,
        amount: 10,
      }).success,
    ).toBe(true);
    expect(
      CreditAdminOverviewResponseSchema.safeParse({
        success: true,
        totalUsers: 1,
        totalCredits: 10,
        topUsers: [
          {
            id: user.id,
            username: user.username,
            credits: 10,
            status: 'ACTIVE',
            role: 'USER',
          },
        ],
        recentTransactions: [transaction],
      }).success,
    ).toBe(true);
    expect(FacePresetSchema.safeParse(facePreset).success).toBe(true);
    expect(StylePresetSchema.safeParse(stylePreset).success).toBe(true);
    expect(
      FacePresetDeleteResponseSchema.safeParse({
        success: true,
        id: facePreset.id,
      }).success,
    ).toBe(true);
    expect(
      PresetMetaBatchResponseSchema.safeParse({
        items: [facePreset, stylePreset],
      }).success,
    ).toBe(true);
  });

  it('Task response schemas validate shapes', () => {
    const task = {
      id: 'task-1',
      createdAt: Date.now(),
      requirements: 'req',
      shotCount: 1,
      layoutMode: 'Individual',
      layout_mode: 'Individual',
      scene: 'Direct',
      resolution: '2K',
      garmentImagePaths: ['/path/a.png'],
      status: 'PENDING',
      resultImages: [],
      config: {},
    };

    expect(TaskModelSchema.safeParse(task).success).toBe(true);
    expect(
      TaskCreateResponseSchema.safeParse({ ...task, claimToken: 'token' })
        .success,
    ).toBe(true);
    expect(
      TaskListResponseSchema.safeParse({
        tasks: [task],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }).success,
    ).toBe(true);
    expect(TaskDeleteResponseSchema.safeParse(true).success).toBe(true);
    expect(
      TaskRetryResponseSchema.safeParse({ message: 'No failed shots to retry' })
        .success,
    ).toBe(true);
    expect(
      TaskApproveResponseSchema.safeParse({
        status: 'ok',
        message: 'Rendering started',
      }).success,
    ).toBe(true);
    expect(
      TaskUpdateShotPromptResponseSchema.safeParse({
        status: 'ok',
        message: 'Prompt updated',
      }).success,
    ).toBe(true);
    expect(
      EditShotResponseSchema.safeParse({
        success: true,
        message: 'ok',
        imagePath: '/path',
        imageUrl: 'http://example.com/a.png',
      }).success,
    ).toBe(true);
  });

  it('Fix/hero storyboard response schemas validate shapes', () => {
    const task = {
      id: 'task-hero-1',
      createdAt: Date.now(),
      requirements: 'req',
      shotCount: 1,
      layoutMode: 'Individual',
      layout_mode: 'Individual',
      scene: 'Auto',
      resolution: '2K',
      garmentImagePaths: ['/path/a.png'],
      status: 'HERO_RENDERING',
      resultImages: [],
      config: {},
    };

    expect(
      FixUpdateQcStatusResponseSchema.safeParse({
        success: true,
        qcStatus: 'APPROVED',
      }).success,
    ).toBe(true);
    expect(
      FixShotResponseSchema.safeParse({
        success: true,
        shotId: 'shot-1',
        newVersion: {
          versionId: 2,
          imagePath: '/path/shot.png',
          prompt: 'prompt',
          fixFeedback: 'fix',
          createdAt: Date.now(),
        },
        imagePath: '/path/shot.png',
      }).success,
    ).toBe(true);
    expect(HeroStoryboardTaskResponseSchema.safeParse(task).success).toBe(true);
  });

  it('Prompt/workflow/brain response schemas validate shapes', () => {
    const author = { id: 'user-1', username: 'admin' };
    const activeRef = {
      versionId: 'v1',
      updatedAt: Date.now(),
      updatedBy: author,
    };
    const meta = {
      versionId: 'v1',
      sha256: 'sha',
      createdAt: Date.now(),
      createdBy: author,
    };

    expect(
      BrainPromptActiveResponseSchema.safeParse({
        success: true,
        ref: null,
        version: null,
      }).success,
    ).toBe(true);
    expect(
      BrainPromptListResponseSchema.safeParse({
        success: true,
        versions: [meta],
      }).success,
    ).toBe(true);
    expect(
      BrainPromptGetVersionResponseSchema.safeParse({
        success: true,
        version: { ...meta, content: 'text' },
      }).success,
    ).toBe(true);
    expect(
      BrainPromptCreateVersionResponseSchema.safeParse({
        success: true,
        version: meta,
      }).success,
    ).toBe(true);
    expect(
      BrainPromptPublishResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: meta,
      }).success,
    ).toBe(true);
    expect(
      BrainPromptAbCompareResponseSchema.safeParse({
        success: true,
        metaA: meta,
        metaB: meta,
        planA: {},
        planB: {},
      }).success,
    ).toBe(true);

    expect(
      WorkflowPromptActiveResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: {
          ...meta,
          pack: { plannerSystemPrompt: 'p', painterSystemPrompt: 'q' },
        },
      }).success,
    ).toBe(true);
    expect(
      WorkflowPromptListResponseSchema.safeParse({
        success: true,
        versions: [meta],
      }).success,
    ).toBe(true);
    expect(
      WorkflowPromptGetVersionResponseSchema.safeParse({
        success: true,
        version: {
          ...meta,
          pack: { plannerSystemPrompt: 'p', painterSystemPrompt: 'q' },
        },
      }).success,
    ).toBe(true);
    expect(
      WorkflowPromptCreateVersionResponseSchema.safeParse({
        success: true,
        version: meta,
      }).success,
    ).toBe(true);
    expect(
      WorkflowPromptPublishResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: meta,
      }).success,
    ).toBe(true);

    expect(
      DirectPromptActiveResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: { ...meta, pack: { directSystemPrompt: 'p' } },
      }).success,
    ).toBe(true);
    expect(
      DirectPromptListResponseSchema.safeParse({
        success: true,
        versions: [meta],
      }).success,
    ).toBe(true);
    expect(
      DirectPromptGetVersionResponseSchema.safeParse({
        success: true,
        version: { ...meta, pack: { directSystemPrompt: 'p' } },
      }).success,
    ).toBe(true);
    expect(
      DirectPromptCreateVersionResponseSchema.safeParse({
        success: true,
        version: meta,
      }).success,
    ).toBe(true);
    expect(
      DirectPromptPublishResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: meta,
      }).success,
    ).toBe(true);

    expect(
      LearnPromptActiveResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: {
          ...meta,
          pack: { styleLearnPrompt: 's', poseLearnPrompt: 'p' },
        },
      }).success,
    ).toBe(true);
    expect(
      LearnPromptListResponseSchema.safeParse({
        success: true,
        versions: [meta],
      }).success,
    ).toBe(true);
    expect(
      LearnPromptGetVersionResponseSchema.safeParse({
        success: true,
        version: {
          ...meta,
          pack: { styleLearnPrompt: 's', poseLearnPrompt: 'p' },
        },
      }).success,
    ).toBe(true);
    expect(
      LearnPromptCreateVersionResponseSchema.safeParse({
        success: true,
        version: meta,
      }).success,
    ).toBe(true);
    expect(
      LearnPromptPublishResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: meta,
      }).success,
    ).toBe(true);

    expect(
      PromptOptimizerResponseSchema.safeParse({
        success: true,
        optimizedPrompt: 'ok',
      }).success,
    ).toBe(true);
    expect(
      PromptOptimizerPromptActiveResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: { ...meta, content: 'c' },
      }).success,
    ).toBe(true);
    expect(
      PromptOptimizerPromptListResponseSchema.safeParse({
        success: true,
        versions: [meta],
      }).success,
    ).toBe(true);
    expect(
      PromptOptimizerPromptGetVersionResponseSchema.safeParse({
        success: true,
        version: { ...meta, content: 'c' },
      }).success,
    ).toBe(true);
    expect(
      PromptOptimizerPromptCreateVersionResponseSchema.safeParse({
        success: true,
        version: meta,
      }).success,
    ).toBe(true);
    expect(
      PromptOptimizerPromptPublishResponseSchema.safeParse({
        success: true,
        ref: activeRef,
        version: meta,
      }).success,
    ).toBe(true);

    expect(
      PromptSnippetListResponseSchema.safeParse([
        {
          id: 'snip-1',
          name: 'n',
          text: 't',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]).success,
    ).toBe(true);
    expect(
      PromptSnippetCreateResponseSchema.safeParse({
        id: 'snip-1',
        text: 't',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).success,
    ).toBe(true);
    expect(
      PromptSnippetDeleteResponseSchema.safeParse({
        success: true,
        id: 'snip-1',
      }).success,
    ).toBe(true);
  });
});
