import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Shared persistence columns for every TypeORM entity in the platform:
 * a uuid primary key plus created/updated timestamps. ORM entities are an
 * infrastructure concern and live in each service's infrastructure layer —
 * they are mapped to/from the pure domain entities.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
