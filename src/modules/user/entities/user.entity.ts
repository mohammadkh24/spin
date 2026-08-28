import { entityNames } from 'src/common/enums/entityNames.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity(entityNames.User)
export class User {
  @PrimaryColumn()
  id: number;

  @Column({ type: 'integer', unique: true, nullable: true })
  ssoId: number | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  @Column({
    default: false,
  })
  isAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
