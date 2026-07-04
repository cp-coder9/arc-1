/**
 * FM Bridge — Maintenance Panel Component
 *
 * Planned Preventive Maintenance management UI:
 * - PPM calendar view (current month, next month, 12-month forward)
 * - Task creation form
 * - Maintenance history per asset
 * - Overdue indicators colour-coded by priority (critical=red, high=amber, medium=blue, low=grey)
 *
 * Requirements: 6.1, 6.2, 6.6
 */

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  X,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  FMBuildingRole,
  PPMScheduleEntry,
  MaintenanceOccurrence,
  MaintenanceFrequency,
  MaintenancePriority,
  MaintenanceState,
} from '../types';
