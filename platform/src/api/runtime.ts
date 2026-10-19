import { http } from "@/lib/http";
import type {
  ActionExecutionResult,
  ActionRunDetail,
  ActionRunFeed,
  CompleteTaskPayload,
  ExecuteActionPayload,
  FlowView,
  InstanceSummary,
  InstanceView,
  NotificationFeed,
  NotificationItem,
  NotificationReadResult,
  StartInstancePayload,
  StartResult,
  TaskDetail,
  TaskSummary,
  TransferTaskPayload,
  UnreadCount
} from "@/types/runtime";

const base = (appId: string) => `/runtime/apps/${appId}`;

export const runtimeApi = {
  async executeAction(
    appId: string,
    actionKey: string,
    payload: ExecuteActionPayload
  ): Promise<ActionExecutionResult> {
    const { data } = await http.post<ActionExecutionResult>(
      `${base(appId)}/actions/${actionKey}/execute`,
      payload
    );
    return data;
  },

  async actionRuns(
    appId: string,
    params: {
      processInstanceId?: string;
      actionKey?: string;
      status?: string;
      limit?: number;
    } = {}
  ): Promise<ActionRunFeed> {
    const { data } = await http.get<ActionRunFeed>(`${base(appId)}/action-runs`, { params });
    return data;
  },

  async actionRun(appId: string, id: string): Promise<ActionRunDetail> {
    const { data } = await http.get<ActionRunDetail>(`${base(appId)}/action-runs/${id}`);
    return data;
  },

  async replayActionRun(appId: string, id: string): Promise<ActionRunDetail> {
    const { data } = await http.post<ActionRunDetail>(
      `${base(appId)}/action-runs/${id}/replay`
    );
    return data;
  },

  async listFlows(appId: string): Promise<FlowView[]> {
    const { data } = await http.get<FlowView[]>(`${base(appId)}/flows`);
    return data;
  },

  async startInstance(
    appId: string,
    flowKey: string,
    payload: StartInstancePayload
  ): Promise<StartResult> {
    const { data } = await http.post<StartResult>(
      `${base(appId)}/flows/${flowKey}/instances`,
      payload
    );
    return data;
  },

  async todo(appId: string): Promise<TaskSummary[]> {
    const { data } = await http.get<TaskSummary[]>(`${base(appId)}/tasks/todo`);
    return data;
  },

  async done(appId: string): Promise<TaskSummary[]> {
    const { data } = await http.get<TaskSummary[]>(`${base(appId)}/tasks/done`);
    return data;
  },

  async initiated(appId: string): Promise<InstanceSummary[]> {
    const { data } = await http.get<InstanceSummary[]>(`${base(appId)}/instances/initiated`);
    return data;
  },

  async notifications(appId: string, limit = 20): Promise<NotificationFeed> {
    const { data } = await http.get<NotificationFeed>(`${base(appId)}/notifications`, {
      params: { limit }
    });
    return data;
  },

  async unreadCount(appId: string): Promise<number> {
    const { data } = await http.get<UnreadCount>(`${base(appId)}/notifications/unread-count`);
    return data.unread;
  },

  async readNotification(appId: string, id: string): Promise<NotificationItem> {
    const { data } = await http.post<NotificationItem>(`${base(appId)}/notifications/${id}/read`);
    return data;
  },

  async readAllNotifications(appId: string): Promise<NotificationReadResult> {
    const { data } = await http.post<NotificationReadResult>(
      `${base(appId)}/notifications/read-all`
    );
    return data;
  },
  async getTask(appId: string, taskId: string): Promise<TaskDetail> {
    const { data } = await http.get<TaskDetail>(`${base(appId)}/tasks/${taskId}`);
    return data;
  },

  async claim(appId: string, taskId: string): Promise<TaskDetail> {
    const { data } = await http.post<TaskDetail>(`${base(appId)}/tasks/${taskId}/claim`);
    return data;
  },

  async complete(
    appId: string,
    taskId: string,
    payload: CompleteTaskPayload
  ): Promise<TaskDetail> {
    const { data } = await http.post<TaskDetail>(
      `${base(appId)}/tasks/${taskId}/complete`,
      payload
    );
    return data;
  },

  async transfer(
    appId: string,
    taskId: string,
    payload: TransferTaskPayload
  ): Promise<TaskDetail> {
    const { data } = await http.post<TaskDetail>(
      `${base(appId)}/tasks/${taskId}/transfer`,
      payload
    );
    return data;
  },

  async getInstance(appId: string, instanceId: string): Promise<InstanceView> {
    const { data } = await http.get<InstanceView>(`${base(appId)}/instances/${instanceId}`);
    return data;
  }
};
