-- CreateTable
CREATE TABLE `family_connections` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `elderId` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(40) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `family_connections_familyId_idx`(`familyId`),
    INDEX `family_connections_elderId_idx`(`elderId`),
    INDEX `family_connections_status_idx`(`status`),
    INDEX `family_connections_familyId_status_idx`(`familyId`, `status`),
    INDEX `family_connections_elderId_status_idx`(`elderId`, `status`),
    UNIQUE INDEX `family_connections_familyId_elderId_key`(`familyId`, `elderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `family_connections` ADD CONSTRAINT `family_connections_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `family_connections` ADD CONSTRAINT `family_connections_elderId_fkey` FOREIGN KEY (`elderId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
