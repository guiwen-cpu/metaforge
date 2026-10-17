package dev.lcp.generated.leave_approval.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记枚举字段对应的共享枚举 key 与允许取值。
 *
 * 平台运行时的等价注解尚未落地，出码引擎先自带一份占位实现，保证产物可独立编译；
 * 接入平台 runtime 后把各实体的 import 换成平台版本即可，注解本身是同一个契约。
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.TYPE_USE, ElementType.ANNOTATION_TYPE })
public @interface LcpEnumRef {
    /** 共享枚举 key，对应 DataSchema.enums[].key */
    String value();
    /** 允许的取值，供运行时校验与前端下拉共用 */
    String[] values() default {};
}
