-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `recipientUserId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `type` ENUM('CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'CONNECTION_REJECTED', 'CHECKIN_COMPLETED', 'CHECKIN_MISSED', 'MEDICATION_DUE', 'MEDICATION_TAKEN', 'MEDICATION_MISSED', 'SOS_TRIGGERED', 'SOS_ACKNOWLEDGED', 'SOS_RESOLVED', 'SOS_CANCELLED', 'SYSTEM') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `relatedEntityType` VARCHAR(50) NULL,
    `relatedEntityId` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_recipientUserId_idx`(`recipientUserId`),
    INDEX `notifications_readAt_idx`(`readAt`),
    INDEX `notifications_createdAt_idx`(`createdAt`),
    INDEX `notifications_recipientUserId_readAt_idx`(`recipientUserId`, `readAt`),
    INDEX `notifications_type_relatedEntityType_relatedEntityId_idx`(`type`, `relatedEntityType`, `relatedEntityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
