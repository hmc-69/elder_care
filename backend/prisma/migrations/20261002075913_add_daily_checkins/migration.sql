-- CreateTable
CREATE TABLE `checkins` (
    `id` VARCHAR(191) NOT NULL,
    `elderId` VARCHAR(191) NOT NULL,
    `checkinDate` DATE NOT NULL,
    `scheduledTime` VARCHAR(5) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'MISSED') NOT NULL DEFAULT 'PENDING',
    `checkedInAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `checkins_elderId_idx`(`elderId`),
    INDEX `checkins_checkinDate_idx`(`checkinDate`),
    INDEX `checkins_status_idx`(`status`),
    UNIQUE INDEX `checkins_elderId_checkinDate_key`(`elderId`, `checkinDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `checkins` ADD CONSTRAINT `checkins_elderId_fkey` FOREIGN KEY (`elderId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
