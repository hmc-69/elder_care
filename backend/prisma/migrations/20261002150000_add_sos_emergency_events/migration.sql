-- CreateTable
CREATE TABLE `emergency_events` (
    `id` VARCHAR(191) NOT NULL,
    `elderId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `triggeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `acknowledgedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancellationReason` VARCHAR(500) NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `emergency_events_elderId_idx`(`elderId`),
    INDEX `emergency_events_status_idx`(`status`),
    INDEX `emergency_events_triggeredAt_idx`(`triggeredAt`),
    INDEX `emergency_events_elderId_status_idx`(`elderId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `emergency_events` ADD CONSTRAINT `emergency_events_elderId_fkey` FOREIGN KEY (`elderId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emergency_events` ADD CONSTRAINT `emergency_events_acknowledgedById_fkey` FOREIGN KEY (`acknowledgedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emergency_events` ADD CONSTRAINT `emergency_events_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
