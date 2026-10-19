package dev.lcp.bff.runtime;

import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.ExecutionListener;
import org.flowable.engine.delegate.TaskListener;
import org.flowable.task.service.delegate.DelegateTask;
import org.springframework.stereotype.Component;

/**
 * BPMN 里声明的平台监听器占位实现。
 *
 * <p>阶段 4 的办理人解析、业务状态回写由 ProcessRuntimeService 在 API 事务内显式完成，
 * 因此监听器只保留扩展点，不在这里读写数据库。阶段 6 的发布态运行时可以替换为异步通知实现。
 */
final class RuntimeListeners {

  private RuntimeListeners() {
  }
}

@Component("lcpProcessStartListener")
class LcpProcessStartListener implements ExecutionListener {

  @Override
  public void notify(DelegateExecution execution) {
    // 运行时在启动实例后显式初始化上下文
  }
}

@Component("lcpProcessEndListener")
class LcpProcessEndListener implements ExecutionListener {

  @Override
  public void notify(DelegateExecution execution) {
    // 运行时在流程结束后显式回写业务表
  }
}

@Component("lcpTaskListener")
class LcpTaskListener implements TaskListener {

  @Override
  public void notify(DelegateTask delegateTask) {
    // 任务创建 / 完成由运行时服务解析办理人
  }
}

@Component("lcpSlaListener")
class LcpSlaListener implements TaskListener {

  @Override
  public void notify(DelegateTask delegateTask) {
    // 阶段 4 未启用超时作业；保留 Bean 以通过 BPMN 解析
  }
}
