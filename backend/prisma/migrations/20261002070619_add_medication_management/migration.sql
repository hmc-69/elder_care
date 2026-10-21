-- CreateTable
CREATE TABLE `medications` (
    `id` VARCHAR(191) NOT NULL,
    `elderId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `dosage` VARCHAR(80) NOT NULL,
    `instructions` VARCHAR(500) NULL,
    `frequency` ENUM('ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'CUSTOM') NOT NULL,
    `times` JSON NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `medications_elderId_active_idx`(`elderId`, `active`),
    INDEX `medications_startDate_endDate_idx`(`startDate`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medication_logs` (
    `id` VARCHAR(191) NOT NULL,
    `medicationId` VARCHAR(191) NOT NULL,
    `scheduledDate` DATE NOT NULL,
    `scheduledTime` VARCHAR(5) NOT NULL,
    `status` ENUM('PENDING', 'TAKEN', 'MISSED') NOT NULL DEFAULT 'PENDING',
    `takenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `medication_logs_scheduledDate_status_idx`(`scheduledDate`, `status`),
    UNIQUE INDEX `medication_logs_medicationId_scheduledDate_scheduledTime_key`(`medicationId`, `scheduledDate`, `scheduledTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `medications` ADD CONSTRAINT `medications_elderId_fkey` FOREIGN KEY (`elderId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medication_logs` ADD CONSTRAINT `medication_logs_medicationId_fkey` FOREIGN KEY (`medicationId`) REFERENCES `medications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
