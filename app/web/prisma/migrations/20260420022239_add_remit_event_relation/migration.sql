-- AddForeignKey
ALTER TABLE "RemitEvent" ADD CONSTRAINT "RemitEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
