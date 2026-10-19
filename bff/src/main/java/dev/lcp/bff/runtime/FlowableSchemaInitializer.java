package dev.lcp.bff.runtime;

import org.flowable.engine.ProcessEngine;
import org.flowable.engine.ProcessEngineConfiguration;
import org.flowable.common.engine.impl.db.DbSqlSessionFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Flowable 用 Connection#setSchema 实现 database-schema，执行命令时会把连接 search_path 覆盖成
 * 单一 schema，导致同一事务里的平台表（public）不可见。
 *
 * <p>启动阶段仍由 Flowable 在 flowable schema 建表；启动完成后清掉运行时 schema 覆盖，
 * 后续命令沿用请求事务的 search_path（public,flowable）。
 */
@Component
class FlowableSchemaInitializer implements ApplicationRunner {

  private final ProcessEngine processEngine;

  FlowableSchemaInitializer(ProcessEngine processEngine) {
    this.processEngine = processEngine;
  }

  @Override
  public void run(ApplicationArguments args) {
    ProcessEngineConfiguration configuration = processEngine.getProcessEngineConfiguration();
    DbSqlSessionFactory dbSqlSessionFactory = configuration.getDbSqlSessionFactory();
    if (dbSqlSessionFactory != null) {
      dbSqlSessionFactory.setDatabaseSchema(null);
    }
  }
}