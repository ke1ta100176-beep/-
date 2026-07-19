-- AlterTable
ALTER TABLE "PostLatestMetric" ADD COLUMN     "performanceClass" "PerformanceClass",
ADD COLUMN     "trendScore" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "PostLatestMetric_trendScore_idx" ON "PostLatestMetric"("trendScore");
