-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('manual', 'csv', 'mock', 'share', 'scraping_api');

-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('pending', 'ok', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('ok', 'failed', 'low_confidence');

-- CreateEnum
CREATE TYPE "PerformanceClass" AS ENUM ('grew', 'normal', 'underperformed', 'too_early', 'insufficient_data');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('fetch_accounts', 'fetch_posts', 'compute_scores', 'analyze_posts', 'generate_report', 'ingest');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('running', 'success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('daily', 'weekly', 'adhoc');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant', 'system');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenreProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "attributeSchema" JSONB NOT NULL,
    "promptGuidance" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenreProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "profileUrl" TEXT,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "benchmarkGroupId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" "SourceType" NOT NULL DEFAULT 'manual',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "instagramUrl" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audioName" TEXT,
    "thumbnailUrl" TEXT,
    "mediaUrl" TEXT,
    "durationSeconds" INTEGER,
    "sourceType" "SourceType" NOT NULL DEFAULT 'manual',
    "fetchStatus" "FetchStatus" NOT NULL DEFAULT 'pending',
    "firstFetchedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMetric" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "followersCount" INTEGER,
    "hoursSincePosted" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "fetchStatus" "FetchStatus" NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostLatestMetric" (
    "postId" TEXT NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "followersCount" INTEGER,
    "viewsDelta" INTEGER,
    "viewsPerHour" DOUBLE PRECISION,
    "growthRate" DOUBLE PRECISION,
    "followerRatio" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostLatestMetric_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mainGenre" TEXT,
    "subGenres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "persona" TEXT,
    "painPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hookType" TEXT,
    "hookText" TEXT,
    "ctaType" TEXT,
    "emotions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appealType" TEXT,
    "personalityLevel" TEXT,
    "videoStructure" TEXT,
    "summary" TEXT,
    "reasoning" TEXT,
    "attributes" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "analysisJson" JSONB,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'ok',
    "errorMessage" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostScore" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "trendScore" DOUBLE PRECISION NOT NULL,
    "velocityScore" DOUBLE PRECISION NOT NULL,
    "growthScore" DOUBLE PRECISION NOT NULL,
    "followerRatioScore" DOUBLE PRECISION NOT NULL,
    "freshnessScore" DOUBLE PRECISION NOT NULL,
    "accountBaselineScore" DOUBLE PRECISION NOT NULL,
    "performanceClass" "PerformanceClass" NOT NULL,
    "baselineSource" TEXT,
    "rawBreakdown" JSONB,
    "calculationVersion" INTEGER NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "classificationThresholds" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPost" (
    "collectionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPost_pkey" PRIMARY KEY ("collectionId","postId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "dateRangeStart" TIMESTAMP(3) NOT NULL,
    "dateRangeEnd" TIMESTAMP(3) NOT NULL,
    "reportJson" JSONB NOT NULL,
    "reportText" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "queryConditions" JSONB,
    "referencedPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "apiUsed" TEXT,
    "approxCostUsd" DOUBLE PRECISION,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IngestToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkGroup_name_key" ON "BenchmarkGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkGroup_slug_key" ON "BenchmarkGroup"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GenreProfile_name_key" ON "GenreProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GenreProfile_slug_key" ON "GenreProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE INDEX "Account_categoryId_idx" ON "Account"("categoryId");

-- CreateIndex
CREATE INDEX "Account_benchmarkGroupId_idx" ON "Account"("benchmarkGroupId");

-- CreateIndex
CREATE INDEX "Account_isActive_idx" ON "Account"("isActive");

-- CreateIndex
CREATE INDEX "Post_accountId_postedAt_idx" ON "Post"("accountId", "postedAt" DESC);

-- CreateIndex
CREATE INDEX "Post_fetchStatus_idx" ON "Post"("fetchStatus");

-- CreateIndex
CREATE INDEX "Post_postedAt_idx" ON "Post"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_accountId_platformPostId_key" ON "Post"("accountId", "platformPostId");

-- CreateIndex
CREATE INDEX "PostMetric_postId_measuredAt_idx" ON "PostMetric"("postId", "measuredAt");

-- CreateIndex
CREATE INDEX "PostMetric_measuredAt_idx" ON "PostMetric"("measuredAt");

-- CreateIndex
CREATE INDEX "PostLatestMetric_views_idx" ON "PostLatestMetric"("views");

-- CreateIndex
CREATE INDEX "PostLatestMetric_viewsPerHour_idx" ON "PostLatestMetric"("viewsPerHour");

-- CreateIndex
CREATE INDEX "PostLatestMetric_followerRatio_idx" ON "PostLatestMetric"("followerRatio");

-- CreateIndex
CREATE INDEX "AiAnalysis_postId_isLatest_idx" ON "AiAnalysis"("postId", "isLatest");

-- CreateIndex
CREATE INDEX "AiAnalysis_postId_analyzedAt_idx" ON "AiAnalysis"("postId", "analyzedAt" DESC);

-- CreateIndex
CREATE INDEX "AiAnalysis_hookType_idx" ON "AiAnalysis"("hookType");

-- CreateIndex
CREATE INDEX "AiAnalysis_ctaType_idx" ON "AiAnalysis"("ctaType");

-- CreateIndex
CREATE INDEX "AiAnalysis_mainGenre_idx" ON "AiAnalysis"("mainGenre");

-- CreateIndex
CREATE INDEX "PostScore_postId_isLatest_idx" ON "PostScore"("postId", "isLatest");

-- CreateIndex
CREATE INDEX "PostScore_trendScore_idx" ON "PostScore"("trendScore" DESC);

-- CreateIndex
CREATE INDEX "PostScore_performanceClass_idx" ON "PostScore"("performanceClass");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringConfig_version_key" ON "ScoringConfig"("version");

-- CreateIndex
CREATE INDEX "Report_reportType_targetDate_idx" ON "Report"("reportType", "targetDate" DESC);

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "JobRun_jobType_startedAt_idx" ON "JobRun"("jobType", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IngestToken_tokenHash_key" ON "IngestToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_benchmarkGroupId_fkey" FOREIGN KEY ("benchmarkGroupId") REFERENCES "BenchmarkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLatestMetric" ADD CONSTRAINT "PostLatestMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostScore" ADD CONSTRAINT "PostScore_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPost" ADD CONSTRAINT "CollectionPost_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPost" ADD CONSTRAINT "CollectionPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestToken" ADD CONSTRAINT "IngestToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
