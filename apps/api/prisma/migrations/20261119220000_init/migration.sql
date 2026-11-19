-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CommunityModeratorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ModerationTargetType" AS ENUM ('QUESTION', 'COMMENT', 'USER', 'GROUP', 'MEDIA');

-- CreateEnum
CREATE TYPE "ModerationTrigger" AS ENUM ('AI_CHECK', 'REPORTS', 'SENSITIVE', 'DARK_CORNER');

-- CreateEnum
CREATE TYPE "ModerationCaseStatus" AS ENUM ('OPEN', 'KEPT', 'REMOVED');

-- CreateEnum
CREATE TYPE "ModerationVerdict" AS ENUM ('KEEP', 'REMOVE', 'UNSURE');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "GroupResolutionStatus" AS ENUM ('PROPOSED', 'DISPUTED', 'FINAL', 'ANNULLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'CANCELED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('MEDIA', 'BRAND');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('QUESTION', 'OPTION', 'AVATAR', 'GROUP_AVATAR', 'SPONSOR_LOGO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AmbassadorStatus" AS ENUM ('APPLIED', 'PROBATION', 'ACTIVE', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('POLL_SINGLE', 'POLL_MULTI', 'THIS_OR_THAT', 'PREDICTION_BINARY', 'PREDICTION_CHOICE');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'OPEN', 'CLOSED', 'RESOLVED', 'ANNULLED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionScope" AS ENUM ('GLOBAL', 'COUNTRY', 'REGION', 'GROUP');

-- CreateEnum
CREATE TYPE "AiCheckResult" AS ENUM ('PASSED', 'FLAGGED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AggregateDimension" AS ENUM ('ALL', 'COUNTRY', 'REGION', 'AGE', 'GENDER');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReactionTargetType" AS ENUM ('QUESTION', 'COMMENT');

-- CreateEnum
CREATE TYPE "BadgeExclusivity" AS ENUM ('NONE', 'WACHTBIJ', 'PREMIUM');

-- CreateEnum
CREATE TYPE "MascotSlot" AS ENUM ('BODY', 'EYES', 'NOSE', 'EARS', 'HAIR', 'BEARD', 'OUTFIT', 'ACCESSORY', 'ACCENT');

-- CreateEnum
CREATE TYPE "MascotUnlock" AS ENUM ('FREE', 'LEVEL', 'BADGE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'HANDLED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(32) NOT NULL,
    "avatarUrl" TEXT,
    "countryCode" VARCHAR(2) NOT NULL,
    "regionCode" VARCHAR(6),
    "birthDate" DATE,
    "birthDateCorrectedAt" TIMESTAMPTZ(6),
    "gender" VARCHAR(16),
    "votesPublicByDefault" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(10) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "winStreak" INTEGER NOT NULL DEFAULT 0,
    "longestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "streakFreezes" INTEGER NOT NULL DEFAULT 0,
    "lastStreakDate" DATE,
    "darkCornerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "darkCornerConfirmedAt" TIMESTAMPTZ(6),
    "termsAcceptedAt" TIMESTAMPTZ(6),
    "termsVersion" VARCHAR(32),
    "ageConfirmedAt" TIMESTAMPTZ(6),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedUntil" TIMESTAMPTZ(6),
    "profilePromptedAt" TIMESTAMPTZ(6),
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "premiumUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterest" (
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("userId","categoryId")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "inApp" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CommunityModerator" (
    "userId" UUID NOT NULL,
    "status" "CommunityModeratorStatus" NOT NULL DEFAULT 'ACTIVE',
    "termsVersion" VARCHAR(32) NOT NULL,
    "termsAcceptedAt" TIMESTAMPTZ(6) NOT NULL,
    "reviewedCount" INTEGER NOT NULL DEFAULT 0,
    "agreedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityModerator_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "targetType" "ModerationTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "trigger" "ModerationTrigger" NOT NULL,
    "status" "ModerationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "viewerCount" INTEGER,
    "reportCount" INTEGER,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "reasonCode" VARCHAR(64),
    "statement" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReview" (
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "verdict" "ModerationVerdict" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationReview_pkey" PRIMARY KEY ("caseId","userId")
);

-- CreateTable
CREATE TABLE "FraudSignal" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "ipHash" VARCHAR(128) NOT NULL,
    "deviceHint" VARCHAR(64) NOT NULL,
    "ipCountry" VARCHAR(2) NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(80) NOT NULL,
    "avatarUrl" TEXT,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 25,
    "seasonLengthMonths" INTEGER NOT NULL DEFAULT 3,
    "seasonStartsAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "points" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentAt" TIMESTAMPTZ(6) NOT NULL,
    "leftAt" TIMESTAMPTZ(6),

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "GroupInvite" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "groupId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupStake" (
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "optionId" UUID,
    "amount" INTEGER NOT NULL,
    "stakeNote" VARCHAR(200),

    CONSTRAINT "GroupStake_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateTable
CREATE TABLE "GroupResolution" (
    "questionId" UUID NOT NULL,
    "proposedOptionId" UUID NOT NULL,
    "proposedById" UUID NOT NULL,
    "proposedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disputeUntil" TIMESTAMPTZ(6) NOT NULL,
    "status" "GroupResolutionStatus" NOT NULL DEFAULT 'PROPOSED',

    CONSTRAINT "GroupResolution_pkey" PRIMARY KEY ("questionId")
);

-- CreateTable
CREATE TABLE "GroupDisputeVote" (
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "optionId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupDisputeVote_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "plan" "Plan" NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(120) NOT NULL,
    "kind" "PartnerKind" NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbedKey" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "partnerId" UUID NOT NULL,
    "keyHash" VARCHAR(128) NOT NULL,
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "EmbedKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "partnerId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "logoAssetId" UUID,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "ownerId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "altText" JSONB NOT NULL DEFAULT '{}',
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "moderationLabels" JSONB NOT NULL DEFAULT '[]',
    "hash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "code" VARCHAR(2) NOT NULL,
    "names" JSONB NOT NULL,
    "localEnabled" BOOLEAN NOT NULL DEFAULT false,
    "localEnabledAt" TIMESTAMPTZ(6),

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Region" (
    "code" VARCHAR(6) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "names" JSONB NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" VARCHAR(64) NOT NULL,
    "names" JSONB NOT NULL,
    "icon" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ambassador" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "regionCode" VARCHAR(6),
    "status" "AmbassadorStatus" NOT NULL DEFAULT 'APPLIED',
    "motivation" TEXT NOT NULL,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "probationEndsAt" TIMESTAMPTZ(6),

    CONSTRAINT "Ambassador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionBlackout" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "countryCode" VARCHAR(2) NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ElectionBlackout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "shortId" VARCHAR(16) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "type" "QuestionType" NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "QuestionScope" NOT NULL,
    "countryCode" VARCHAR(2),
    "regionCode" VARCHAR(6),
    "groupId" UUID,
    "darkCorner" BOOLEAN NOT NULL DEFAULT false,
    "isDaily" BOOLEAN NOT NULL DEFAULT false,
    "sponsorId" UUID,
    "defaultLocale" VARCHAR(10) NOT NULL,
    "authorId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "maxChoices" INTEGER NOT NULL DEFAULT 1,
    "allowVoteChange" BOOLEAN NOT NULL DEFAULT true,
    "imageAssetId" UUID,
    "opensAt" TIMESTAMPTZ(6) NOT NULL,
    "closesAt" TIMESTAMPTZ(6) NOT NULL,
    "resolvesAt" TIMESTAMPTZ(6),
    "resolvedOptionId" UUID,
    "resolutionSource" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedById" UUID,
    "proposedOptionId" UUID,
    "proposedSource" TEXT,
    "proposedAt" TIMESTAMPTZ(6),
    "draftExpiresAt" TIMESTAMPTZ(6),
    "aiCheck" "AiCheckResult",
    "aiCheckLabels" JSONB,
    "hiddenAt" TIMESTAMPTZ(6),
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "questionId" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,

    CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("questionId","locale")
);

-- CreateTable
CREATE TABLE "DailyQuestion" (
    "date" DATE NOT NULL,
    "scopeKey" VARCHAR(8) NOT NULL,
    "questionId" UUID NOT NULL,
    "chosenById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyQuestion_pkey" PRIMARY KEY ("date","scopeKey")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "questionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "imageAssetId" UUID,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionTranslation" (
    "optionId" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "label" VARCHAR(120) NOT NULL,

    CONSTRAINT "OptionTranslation_pkey" PRIMARY KEY ("optionId","locale")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "questionId" UUID NOT NULL,
    "userId" UUID,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "countsFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapCountry" VARCHAR(2) NOT NULL,
    "snapRegion" VARCHAR(6),
    "snapAgeBucket" VARCHAR(16),
    "snapGender" VARCHAR(16),

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteChoice" (
    "voteId" UUID NOT NULL,
    "optionId" UUID NOT NULL,

    CONSTRAINT "VoteChoice_pkey" PRIMARY KEY ("voteId","optionId")
);

-- CreateTable
CREATE TABLE "QuestionSkip" (
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionSkip_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateTable
CREATE TABLE "Forecast" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "optionId" UUID,
    "probability" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastHistory" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "forecastId" UUID NOT NULL,
    "optionId" UUID,
    "probability" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrowdSnapshot" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "questionId" UUID NOT NULL,
    "optionId" UUID,
    "probability" DOUBLE PRECISION NOT NULL,
    "forecasterCount" INTEGER NOT NULL,
    "takenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrowdSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionScore" (
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "brier" DOUBLE PRECISION NOT NULL,
    "crowdBrier" DOUBLE PRECISION NOT NULL,
    "points" INTEGER NOT NULL,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionScore_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateTable
CREATE TABLE "ResultAggregate" (
    "questionId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "dimension" "AggregateDimension" NOT NULL,
    "dimensionValue" VARCHAR(16) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResultAggregate_pkey" PRIMARY KEY ("questionId","optionId","dimension","dimensionValue")
);

-- CreateTable
CREATE TABLE "Follow" (
    "followerId" UUID NOT NULL,
    "followeeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followeeId")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "userAId" UUID NOT NULL,
    "userBId" UUID NOT NULL,
    "sharedCount" INTEGER NOT NULL DEFAULT 0,
    "agreeCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("userAId","userBId")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "showChoice" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "targetType" "ReactionTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" VARCHAR(64) NOT NULL,
    "names" JSONB NOT NULL,
    "descriptions" JSONB NOT NULL,
    "icon" VARCHAR(64) NOT NULL,
    "title" JSONB,
    "exclusiveTo" "BadgeExclusivity" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomization" (
    "userId" UUID NOT NULL,
    "mascotLook" JSONB,
    "mascotName" VARCHAR(32),
    "useOwnBee" BOOLEAN NOT NULL DEFAULT false,
    "useBeeAsAvatar" BOOLEAN NOT NULL DEFAULT false,
    "accent" VARCHAR(32),
    "startTab" VARCHAR(32),
    "hiddenCategoryIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "textSize" VARCHAR(16),
    "compactCards" BOOLEAN NOT NULL DEFAULT false,
    "celebrations" JSONB NOT NULL DEFAULT '{}',
    "featuredBadgeIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "titleBadgeId" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCustomization_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MascotItem" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slot" "MascotSlot" NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "unlock" "MascotUnlock" NOT NULL DEFAULT 'FREE',
    "unlockValue" VARCHAR(64),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MascotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalMascot" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(64) NOT NULL,
    "look" JSONB NOT NULL,
    "countryCode" VARCHAR(2),
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonalMascot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" UUID NOT NULL,
    "badgeId" UUID NOT NULL,
    "awardedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "amount" INTEGER NOT NULL,
    "refId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "inviterId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "usedById" UUID,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reporterId" UUID NOT NULL,
    "targetType" "ModerationTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actorId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "targetType" VARCHAR(32) NOT NULL,
    "targetId" VARCHAR(64) NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_countryCode_idx" ON "User"("countryCode");

-- CreateIndex
CREATE INDEX "User_regionCode_idx" ON "User"("regionCode");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "UserInterest_categoryId_idx" ON "UserInterest"("categoryId");

-- CreateIndex
CREATE INDEX "AppSetting_updatedById_idx" ON "AppSetting"("updatedById");

-- CreateIndex
CREATE INDEX "ModerationCase_status_createdAt_idx" ON "ModerationCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationCase_targetType_targetId_idx" ON "ModerationCase"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ModerationCase_decidedById_idx" ON "ModerationCase"("decidedById");

-- CreateIndex
CREATE INDEX "ModerationReview_userId_idx" ON "ModerationReview"("userId");

-- CreateIndex
CREATE INDEX "FraudSignal_ipHash_day_idx" ON "FraudSignal"("ipHash", "day");

-- CreateIndex
CREATE INDEX "FraudSignal_createdAt_idx" ON "FraudSignal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FraudSignal_userId_day_ipHash_deviceHint_key" ON "FraudSignal"("userId", "day", "ipHash", "deviceHint");

-- CreateIndex
CREATE INDEX "Group_ownerId_idx" ON "Group"("ownerId");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvite_code_key" ON "GroupInvite"("code");

-- CreateIndex
CREATE INDEX "GroupInvite_groupId_idx" ON "GroupInvite"("groupId");

-- CreateIndex
CREATE INDEX "GroupInvite_createdById_idx" ON "GroupInvite"("createdById");

-- CreateIndex
CREATE INDEX "GroupStake_userId_idx" ON "GroupStake"("userId");

-- CreateIndex
CREATE INDEX "GroupStake_optionId_idx" ON "GroupStake"("optionId");

-- CreateIndex
CREATE INDEX "GroupResolution_proposedOptionId_idx" ON "GroupResolution"("proposedOptionId");

-- CreateIndex
CREATE INDEX "GroupResolution_proposedById_idx" ON "GroupResolution"("proposedById");

-- CreateIndex
CREATE INDEX "GroupResolution_status_disputeUntil_idx" ON "GroupResolution"("status", "disputeUntil");

-- CreateIndex
CREATE INDEX "GroupDisputeVote_userId_idx" ON "GroupDisputeVote"("userId");

-- CreateIndex
CREATE INDEX "GroupDisputeVote_optionId_idx" ON "GroupDisputeVote"("optionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_periodEnd_idx" ON "Subscription"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "EmbedKey_keyHash_key" ON "EmbedKey"("keyHash");

-- CreateIndex
CREATE INDEX "EmbedKey_partnerId_idx" ON "EmbedKey"("partnerId");

-- CreateIndex
CREATE INDEX "Sponsor_partnerId_idx" ON "Sponsor"("partnerId");

-- CreateIndex
CREATE INDEX "Sponsor_logoAssetId_idx" ON "Sponsor"("logoAssetId");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_idx" ON "MediaAsset"("ownerId");

-- CreateIndex
CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_hash_idx" ON "MediaAsset"("hash");

-- CreateIndex
CREATE INDEX "Region_countryCode_idx" ON "Region"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Ambassador_userId_idx" ON "Ambassador"("userId");

-- CreateIndex
CREATE INDEX "Ambassador_countryCode_status_idx" ON "Ambassador"("countryCode", "status");

-- CreateIndex
CREATE INDEX "Ambassador_regionCode_idx" ON "Ambassador"("regionCode");

-- CreateIndex
CREATE INDEX "Ambassador_decidedById_idx" ON "Ambassador"("decidedById");

-- CreateIndex
CREATE INDEX "ElectionBlackout_countryCode_startsAt_idx" ON "ElectionBlackout"("countryCode", "startsAt");

-- CreateIndex
CREATE INDEX "ElectionBlackout_createdById_idx" ON "ElectionBlackout"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Question_shortId_key" ON "Question"("shortId");

-- CreateIndex
CREATE INDEX "Question_status_scope_countryCode_opensAt_idx" ON "Question"("status", "scope", "countryCode", "opensAt");

-- CreateIndex
CREATE INDEX "Question_categoryId_status_idx" ON "Question"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Question_groupId_idx" ON "Question"("groupId");

-- CreateIndex
CREATE INDEX "Question_darkCorner_status_idx" ON "Question"("darkCorner", "status");

-- CreateIndex
CREATE INDEX "Question_isDaily_resolvesAt_idx" ON "Question"("isDaily", "resolvesAt");

-- CreateIndex
CREATE INDEX "Question_regionCode_idx" ON "Question"("regionCode");

-- CreateIndex
CREATE INDEX "Question_sponsorId_idx" ON "Question"("sponsorId");

-- CreateIndex
CREATE INDEX "Question_authorId_createdAt_idx" ON "Question"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Question_imageAssetId_idx" ON "Question"("imageAssetId");

-- CreateIndex
CREATE INDEX "Question_resolvedOptionId_idx" ON "Question"("resolvedOptionId");

-- CreateIndex
CREATE INDEX "Question_resolvedById_idx" ON "Question"("resolvedById");

-- CreateIndex
CREATE INDEX "Question_proposedOptionId_idx" ON "Question"("proposedOptionId");

-- CreateIndex
CREATE INDEX "Question_status_closesAt_idx" ON "Question"("status", "closesAt");

-- CreateIndex
CREATE INDEX "DailyQuestion_questionId_idx" ON "DailyQuestion"("questionId");

-- CreateIndex
CREATE INDEX "DailyQuestion_chosenById_idx" ON "DailyQuestion"("chosenById");

-- CreateIndex
CREATE INDEX "Option_imageAssetId_idx" ON "Option"("imageAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Option_questionId_position_key" ON "Option"("questionId", "position");

-- CreateIndex
CREATE INDEX "Vote_userId_idx" ON "Vote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_questionId_userId_key" ON "Vote"("questionId", "userId");

-- CreateIndex
CREATE INDEX "VoteChoice_optionId_idx" ON "VoteChoice"("optionId");

-- CreateIndex
CREATE INDEX "QuestionSkip_userId_idx" ON "QuestionSkip"("userId");

-- CreateIndex
CREATE INDEX "Forecast_userId_idx" ON "Forecast"("userId");

-- CreateIndex
CREATE INDEX "Forecast_optionId_idx" ON "Forecast"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "Forecast_questionId_userId_key" ON "Forecast"("questionId", "userId");

-- CreateIndex
CREATE INDEX "ForecastHistory_forecastId_createdAt_idx" ON "ForecastHistory"("forecastId", "createdAt");

-- CreateIndex
CREATE INDEX "ForecastHistory_optionId_idx" ON "ForecastHistory"("optionId");

-- CreateIndex
CREATE INDEX "CrowdSnapshot_questionId_takenAt_idx" ON "CrowdSnapshot"("questionId", "takenAt");

-- CreateIndex
CREATE INDEX "CrowdSnapshot_optionId_idx" ON "CrowdSnapshot"("optionId");

-- CreateIndex
CREATE INDEX "PredictionScore_userId_computedAt_idx" ON "PredictionScore"("userId", "computedAt");

-- CreateIndex
CREATE INDEX "ResultAggregate_optionId_idx" ON "ResultAggregate"("optionId");

-- CreateIndex
CREATE INDEX "Follow_followeeId_idx" ON "Follow"("followeeId");

-- CreateIndex
CREATE INDEX "Agreement_userBId_idx" ON "Agreement"("userBId");

-- CreateIndex
CREATE INDEX "Comment_questionId_createdAt_idx" ON "Comment"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Reaction_targetType_targetId_idx" ON "Reaction"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_userId_targetType_targetId_emoji_key" ON "Reaction"("userId", "targetType", "targetId", "emoji");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE INDEX "UserCustomization_titleBadgeId_idx" ON "UserCustomization"("titleBadgeId");

-- CreateIndex
CREATE UNIQUE INDEX "MascotItem_slot_key_key" ON "MascotItem"("slot", "key");

-- CreateIndex
CREATE INDEX "SeasonalMascot_startsAt_endsAt_idx" ON "SeasonalMascot"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "SeasonalMascot_countryCode_idx" ON "SeasonalMascot"("countryCode");

-- CreateIndex
CREATE INDEX "SeasonalMascot_createdById_idx" ON "SeasonalMascot"("createdById");

-- CreateIndex
CREATE INDEX "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");

-- CreateIndex
CREATE INDEX "XpEvent_userId_createdAt_idx" ON "XpEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_usedById_key" ON "Invite"("usedById");

-- CreateIndex
CREATE INDEX "Invite_inviterId_idx" ON "Invite"("inviterId");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_status_idx" ON "Report"("targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_handledById_idx" ON "Report"("handledById");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityModerator" ADD CONSTRAINT "CommunityModerator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReview" ADD CONSTRAINT "ModerationReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReview" ADD CONSTRAINT "ModerationReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStake" ADD CONSTRAINT "GroupStake_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStake" ADD CONSTRAINT "GroupStake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStake" ADD CONSTRAINT "GroupStake_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupResolution" ADD CONSTRAINT "GroupResolution_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupResolution" ADD CONSTRAINT "GroupResolution_proposedOptionId_fkey" FOREIGN KEY ("proposedOptionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupResolution" ADD CONSTRAINT "GroupResolution_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDisputeVote" ADD CONSTRAINT "GroupDisputeVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDisputeVote" ADD CONSTRAINT "GroupDisputeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDisputeVote" ADD CONSTRAINT "GroupDisputeVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedKey" ADD CONSTRAINT "EmbedKey_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionBlackout" ADD CONSTRAINT "ElectionBlackout_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionBlackout" ADD CONSTRAINT "ElectionBlackout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_resolvedOptionId_fkey" FOREIGN KEY ("resolvedOptionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_proposedOptionId_fkey" FOREIGN KEY ("proposedOptionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuestion" ADD CONSTRAINT "DailyQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuestion" ADD CONSTRAINT "DailyQuestion_chosenById_fkey" FOREIGN KEY ("chosenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionTranslation" ADD CONSTRAINT "OptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteChoice" ADD CONSTRAINT "VoteChoice_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "Vote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteChoice" ADD CONSTRAINT "VoteChoice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSkip" ADD CONSTRAINT "QuestionSkip_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSkip" ADD CONSTRAINT "QuestionSkip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastHistory" ADD CONSTRAINT "ForecastHistory_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "Forecast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastHistory" ADD CONSTRAINT "ForecastHistory_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrowdSnapshot" ADD CONSTRAINT "CrowdSnapshot_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrowdSnapshot" ADD CONSTRAINT "CrowdSnapshot_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionScore" ADD CONSTRAINT "PredictionScore_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionScore" ADD CONSTRAINT "PredictionScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultAggregate" ADD CONSTRAINT "ResultAggregate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultAggregate" ADD CONSTRAINT "ResultAggregate_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomization" ADD CONSTRAINT "UserCustomization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomization" ADD CONSTRAINT "UserCustomization_titleBadgeId_fkey" FOREIGN KEY ("titleBadgeId") REFERENCES "Badge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonalMascot" ADD CONSTRAINT "SeasonalMascot_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonalMascot" ADD CONSTRAINT "SeasonalMascot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Added by hand: constraints Prisma cannot express (see the comments in schema.prisma) ───

ALTER TABLE "User" ADD CONSTRAINT "User_streakFreezes_check" CHECK ("streakFreezes" BETWEEN 0 AND 2);

ALTER TABLE "Group" ADD CONSTRAINT "Group_seasonLengthMonths_check" CHECK ("seasonLengthMonths" IN (1, 3, 6));
ALTER TABLE "Group" ADD CONSTRAINT "Group_maxMembers_check" CHECK ("maxMembers" > 0);

ALTER TABLE "GroupStake" ADD CONSTRAINT "GroupStake_amount_check" CHECK ("amount" > 0);

ALTER TABLE "ElectionBlackout" ADD CONSTRAINT "ElectionBlackout_period_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "SeasonalMascot" ADD CONSTRAINT "SeasonalMascot_period_check" CHECK ("endsAt" > "startsAt");

ALTER TABLE "Question" ADD CONSTRAINT "Question_scope_check" CHECK (
  ("scope" = 'GROUP') = ("groupId" IS NOT NULL)
  AND ("scope" NOT IN ('COUNTRY', 'REGION') OR "countryCode" IS NOT NULL)
  AND ("scope" <> 'REGION' OR "regionCode" IS NOT NULL)
);
ALTER TABLE "Question" ADD CONSTRAINT "Question_maxChoices_check" CHECK ("maxChoices" >= 1);
ALTER TABLE "Question" ADD CONSTRAINT "Question_period_check" CHECK ("closesAt" > "opensAt");

ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_probability_check" CHECK ("probability" BETWEEN 1 AND 99);
ALTER TABLE "ForecastHistory" ADD CONSTRAINT "ForecastHistory_probability_check" CHECK ("probability" BETWEEN 1 AND 99);
ALTER TABLE "CrowdSnapshot" ADD CONSTRAINT "CrowdSnapshot_probability_check" CHECK ("probability" BETWEEN 0 AND 100);

ALTER TABLE "Follow" ADD CONSTRAINT "Follow_not_self_check" CHECK ("followerId" <> "followeeId");
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_pair_order_check" CHECK ("userAId" < "userBId");

-- Full-text search on question titles, one index per content language (PLAN.md "Datamodel").
CREATE INDEX "QuestionTranslation_title_fts_nl" ON "QuestionTranslation" USING GIN (to_tsvector('dutch', "title")) WHERE "locale" = 'nl';
CREATE INDEX "QuestionTranslation_title_fts_en" ON "QuestionTranslation" USING GIN (to_tsvector('english', "title")) WHERE "locale" = 'en';
